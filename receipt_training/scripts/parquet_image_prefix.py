"""Research-only prefix reader for CORD's single, oversized image dictionary.

PyArrow supplies schema, metadata, small-page decompression and all text columns.
This narrow adapter supports one SNAPPY/PLAIN BYTE_ARRAY dictionary and a v1
RLE_DICTIONARY data page. It rejects other layouts instead of guessing. It is
not an application upload parser or a general Parquet/Snappy implementation.

Format references:
https://github.com/apache/parquet-format/blob/master/Encodings.md
https://github.com/apache/thrift/blob/master/doc/specs/thrift-compact-protocol.md
https://github.com/google/snappy/blob/main/format_description.txt
"""
from __future__ import annotations

import io
import struct


def require(condition, message):
    if not condition:
        raise ValueError(message)


def exact(stream, count):
    data = stream.read(count)
    require(len(data) == count, 'Truncated dictionary/page data')
    return data


def varint(stream, max_bytes=5):
    value = 0
    for index in range(max_bytes):
        byte = exact(stream, 1)[0]
        value |= (byte & 127) << (7 * index)
        if not byte & 128:
            return value
    raise ValueError('Oversized unsigned varint')


def page_header(stream):
    """Read the bounded Compact Protocol structs used by Parquet page headers."""
    start = stream.tell()

    def integer():
        value = varint(stream, 10)
        return (value >> 1) ^ -(value & 1)

    def value(kind, depth):
        require(depth <= 8 and stream.tell() - start <= 16384, 'Oversized page header')
        if kind in (1, 2):
            return kind == 1
        if kind == 3:
            return exact(stream, 1)[0]
        if kind in (4, 5, 6):
            return integer()
        if kind == 7:
            return struct.unpack('<d', exact(stream, 8))[0]
        if kind == 8:
            length = varint(stream)
            require(length <= 8192, 'Unsupported large page-header binary field')
            return exact(stream, length)
        if kind == 12:
            result, previous = {}, 0
            for _ in range(128):
                header = exact(stream, 1)[0]
                if header == 0:
                    return result
                field = previous + (header >> 4) if header >> 4 else integer()
                require(field > 0 and field not in result, 'Invalid Compact Protocol field')
                result[field] = value(header & 15, depth + 1)
                previous = field
            raise ValueError('Too many page-header fields')
        raise ValueError('Unsupported page-header field type')

    result = value(12, 0)
    require(stream.tell() - start <= 16384, 'Oversized page header')
    return result


def hybrid(data, width, count):
    """Decode bounded v1 RLE/bit-packed levels or dictionary indices."""
    require(0 <= width <= 16 and 0 <= count <= 1000, 'Unsupported index bounds')
    stream, result = io.BytesIO(data), []
    while len(result) < count:
        header = varint(stream)
        run = header >> 1
        require(0 < run <= 1000, 'Invalid index run')
        if header & 1:
            require(run * 8 <= count - len(result) + 7, 'Oversized packed index run')
            packed = int.from_bytes(exact(stream, run * width), 'little')
            result.extend((packed >> (i * width)) & ((1 << width) - 1) for i in range(run * 8))
        else:
            require(run <= count - len(result), 'Oversized repeated index run')
            item = int.from_bytes(exact(stream, (width + 7) // 8), 'little')
            require(item < 1 << width, 'Index exceeds its bit width')
            result.extend([item] * run)
    require(stream.tell() == len(data), 'Trailing index bytes')
    return result[:count]


class Window:
    """Sequential reads over bounded source ranges, with at most 4 MiB buffered."""
    def __init__(self, source, offset, length):
        self.source, self.offset, self.length = source, offset, length
        self.position, self.buffer, self.cursor = 0, b'', 0

    def read(self, count):
        require(0 <= count <= 65536, 'Oversized prefix decoder read')
        parts = []
        while count and self.position < self.length:
            if self.cursor == len(self.buffer):
                self.source.seek(self.offset + self.position)
                self.buffer = exact(self.source, min(4 * 1024**2, self.length - self.position))
                self.cursor = 0
            size = min(count, len(self.buffer) - self.cursor)
            parts.append(self.buffer[self.cursor:self.cursor + size])
            self.cursor += size
            self.position += size
            count -= size
        return b''.join(parts)


class SnappyPrefix:
    """Raw Snappy prefix decoding with a strict 64 KiB backreference window.

    Larger legal offsets are deliberately unsupported and fail closed. Prefix
    consumption does not verify a complete page, its CRC, or a whole-file hash.
    """
    def __init__(self, source, uncompressed_size):
        self.source = source
        self.length = varint(source)
        require(self.length == uncompressed_size <= 512 * 1024**2, 'Unexpected dictionary size')
        self.history, self.cursor, self.decoded = bytearray(65536), 0, 0
        self.pending, self.literal_left, self.consumed = b'', 0, 0

    def emit(self, data):
        size = len(data)
        require(self.decoded + size <= self.length, 'Snappy output exceeds declared size')
        first = min(size, 65536 - self.cursor)
        self.history[self.cursor:self.cursor + first] = data[:first]
        if first < size:
            self.history[:size - first] = data[first:]
        self.cursor = (self.cursor + size) % 65536
        self.decoded += size
        return data

    def piece(self):
        if self.literal_left:
            size = min(65536, self.literal_left)
            self.literal_left -= size
            return self.emit(exact(self.source, size))
        tag = exact(self.source, 1)[0]
        kind = tag & 3
        if kind == 0:
            upper = tag >> 2
            self.literal_left = upper + 1 if upper < 60 else int.from_bytes(exact(self.source, upper - 59), 'little') + 1
            require(self.literal_left <= self.length - self.decoded, 'Invalid Snappy literal length')
            return self.piece()
        if kind == 1:
            length = 4 + ((tag >> 2) & 7)
            offset = ((tag & 224) << 3) | exact(self.source, 1)[0]
        else:
            length = 1 + (tag >> 2)
            offset = int.from_bytes(exact(self.source, 2 if kind == 2 else 4), 'little')
        require(0 < offset <= min(self.decoded, 65536), 'Unsupported/invalid Snappy backreference')
        start = (self.cursor - offset) % 65536
        size = min(offset, length)
        seed = bytes((self.history[start:] + self.history[:start])[:size]) if start + size > 65536 else bytes(self.history[start:start + size])
        return self.emit((seed * ((length + size - 1) // size))[:length])

    def read(self, count):
        require(0 <= count <= 12 * 1024**2, 'Oversized dictionary value')
        count = min(count, self.length - self.consumed)
        parts, remaining = [], count
        while remaining:
            if not self.pending:
                self.pending = self.piece()
            size = min(remaining, len(self.pending))
            parts.append(self.pending[:size])
            self.pending = self.pending[size:]
            remaining -= size
        self.consumed += count
        return b''.join(parts)


def image_dictionary(source, parquet, selected_rows, codec):
    """Return selected raw image bytes plus transport/encoding facts, no labels."""
    require(parquet.metadata.num_row_groups == 1, 'Only a single row group is supported')
    index = next(i for i in range(len(parquet.schema)) if parquet.schema.column(i).path == 'image.bytes')
    schema = parquet.schema.column(index)
    column = parquet.metadata.row_group(0).column(index)
    count = parquet.metadata.num_rows
    require(schema.physical_type == 'BYTE_ARRAY' and schema.max_repetition_level == 0, 'Unsupported image schema')
    require(column.compression == 'SNAPPY' and 0 < count <= 1000, 'Unsupported image compression/row count')
    require(0 <= min(selected_rows) <= max(selected_rows) < count, 'Invalid selected source rows')

    source.seek(column.data_page_offset)
    header = page_header(io.BytesIO(exact(source, min(16384, source.size - source.tell()))))
    require(header[1] == 0 and header[5][1] == count and header[5][2] in (2, 8), 'Unsupported data page')
    require(header[5][3] == 3 and 0 < header[2] <= 16384 and 0 < header[3] <= 16384, 'Unsupported level/page encoding')
    source.seek(column.data_page_offset)
    page_stream = io.BytesIO(exact(source, min(32768, source.size - source.tell())))
    page_header(page_stream)
    raw = bytes(codec.decompress(exact(page_stream, header[3]), header[2]))
    levels = io.BytesIO(raw)
    if schema.max_definition_level:
        size = int.from_bytes(exact(levels, 4), 'little')
        definitions = hybrid(exact(levels, size), schema.max_definition_level.bit_length(), count)
        require(all(n == schema.max_definition_level for n in definitions), 'Null image values are unsupported')
    width = exact(levels, 1)[0]
    indices = hybrid(levels.read(), width, count)

    source.seek(column.dictionary_page_offset)
    dictionary_header = io.BytesIO(exact(source, min(16384, source.size - source.tell())))
    dictionary = page_header(dictionary_header)
    # This pinned older CORD shard declares deprecated PLAIN_DICTIONARY (2)
    # for its plain dictionary payload. Native PyArrow compatibility is tested.
    require(dictionary[1] == 2 and dictionary[7][2] in (0, 2), 'Unsupported dictionary page')
    entries = dictionary[7][1]
    require(0 < entries <= count and all(0 <= i < entries for i in indices), 'Invalid dictionary indices')
    payload_offset = column.dictionary_page_offset + dictionary_header.tell()
    require(payload_offset + dictionary[3] == column.data_page_offset, 'Unexpected dictionary/data page layout')
    window = Window(source, payload_offset, dictionary[3])
    decoder = SnappyPrefix(window, dictionary[2])
    wanted = {indices[row] for row in selected_rows}
    values = {}
    for item in range(max(wanted) + 1):
        length = int.from_bytes(exact(decoder, 4), 'little')
        require(0 < length <= 12 * 1024**2, 'Invalid raw image dictionary value size')
        if item in wanted:
            values[item] = exact(decoder, length)
        else:
            remaining = length
            while remaining:
                size = min(65536, remaining)
                exact(decoder, size)
                remaining -= size
    return ({row: values[indices[row]] for row in selected_rows}, {
        'row_count': count, 'dictionary_entries': entries,
        'selected_row_dictionary_indices': {str(row): indices[row] for row in selected_rows},
        'dictionary_prefix_compressed_consumed': window.position,
        'dictionary_prefix_uncompressed_consumed': decoder.consumed,
        'complete_dictionary_page_verified': decoder.consumed == dictionary[2],
        'page_crc_verified': False, 'whole_file_hash_verified': False,
        'scope': 'Pinned HTTPS ranges and exact raw-image byte hashes; partial dictionary integrity only.'})
