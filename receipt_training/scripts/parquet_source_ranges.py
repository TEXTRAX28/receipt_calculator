"""Bounded anonymous HTTP ranges for pinned public Parquet; no signed URL logging."""
from __future__ import annotations
import hashlib
import io
import re
import time
import urllib.error
import urllib.parse
import urllib.request


class RangeSource(io.RawIOBase):
    def __init__(self, url, size, *, max_bytes=256*1024**2, max_read=8*1024**2, seconds=180):
        super().__init__()
        parsed=urllib.parse.urlsplit(url)
        if parsed.scheme!='https' or parsed.hostname!='huggingface.co' or parsed.query:
            raise ValueError('Use a stable pinned public Hub file URL')
        self.url,self.size,self.position=url,size,0
        self.max_bytes,self.max_read,self.seconds=max_bytes,max_read,seconds
        self.started=time.monotonic();self.bytes=0;self.events=[];self.etag=None;self.cache={}

    def readable(self):return True
    def seekable(self):return True
    def tell(self):return self.position
    def seek(self,offset,whence=0):
        target=offset if whence==0 else self.position+offset if whence==1 else self.size+offset if whence==2 else -1
        if not 0<=target<=self.size:raise ValueError('Invalid source range seek')
        self.position=target;return target

    def read(self,size=-1):
        if self.closed:raise ValueError('Source is closed')
        count=min(self.size-self.position,self.size if size is None or size<0 else size)
        if count==0:return b''
        if count>self.max_read:raise ValueError('Requested Parquet read exceeds the bounded per-read policy')
        key=(self.position,count)
        if key in self.cache:
            self.position+=count;return self.cache[key]
        if len(self.events)>=256 or self.bytes+count>self.max_bytes or time.monotonic()-self.started>self.seconds:
            raise ValueError('Public range budget exhausted')
        start=self.position;end=start+count-1
        event={'offset':start,'requested_bytes':count};self.events.append(event)
        request=urllib.request.Request(self.url,headers={'Range':f'bytes={start}-{end}','User-Agent':'GatherReceiptEvaluation/1.0'})
        try:
            with urllib.request.urlopen(request,timeout=20) as response:
                host=urllib.parse.urlsplit(response.geturl()).hostname or ''
                if not (host=='huggingface.co' or host.endswith('.hf.co') or host.endswith('.huggingface.co')):
                    raise ValueError('Unexpected public file redirect host')
                event['status']=response.status
                if response.status!=206 or response.headers.get('Content-Range')!=f'bytes {start}-{end}/{self.size}':
                    raise ValueError('Source did not honor the exact HTTP range')
                etag=response.headers.get('ETag')
                if self.etag is not None and etag!=self.etag:raise ValueError('Source ETag changed during a pinned read')
                self.etag=etag
                data=response.read(count+1)
                if len(data)!=count:raise ValueError('Incomplete public range')
        except urllib.error.HTTPError as error:
            event['status']=error.code
            raise ValueError(f'Public file HTTP {error.code}; no automatic retry') from None
        except (OSError,TimeoutError):
            raise ValueError('Public file connection failed; no automatic retry') from None
        self.bytes+=len(data);self.position+=count
        event.update(payload_bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
        if sum(len(value) for value in self.cache.values())+len(data)<=8*1024**2:self.cache[key]=data
        return data

    def readinto(self,buffer):
        data=self.read(len(buffer));buffer[:len(data)]=data;return len(data)

    def summary(self):
        return {'stable_source_url':self.url,'source_file_bytes':self.size,'logical_range_gets':len(self.events),
                'payload_bytes_read':self.bytes,'etag':self.etag,'ranges':self.events,
                'whole_file_sha256_verified':False,'signed_redirect_urls_persisted':False}
