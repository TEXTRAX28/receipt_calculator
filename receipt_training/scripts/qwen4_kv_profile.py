"""Fixed research-only cache profile; production reader/defaults are untouched."""
import hashlib
import json

from vision_trial_guard import VisionMemoryGuard

PROFILE = 'qwen3-vl-4b-q8-kv-fa-v1'
MANIFEST_SEMANTIC_SHA256 = 'ccb5bb3615befb9b22645ef9f1775811898bd99fb4fae11a24c018b63c0eda1b'
FLAGS = ('--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0', '--flash-attn', 'on')
STARTUP_BYTES = 3 * 1024**3


def validate_profile(manifest, request):
    digest = hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if digest != MANIFEST_SEMANTIC_SHA256 or request.get('research_backend') != PROFILE:
        raise ValueError('The Q8 KV profile requires the exact pinned selected 4B manifest')
    fixed = {'context': 8192, 'max_tokens': 4000, 'image_tokens': 1536, 'gpu_layers': 'auto'}
    if any(request.get(key) != value for key, value in fixed.items()):
        raise ValueError('The Q8 KV profile keeps its frozen context/output/image/offload settings')
    if (request.get('output_mode', 'structured-receipt') != 'structured-receipt'
            or request.get('projector_gpu', True) is not True
            or request.get('constrain_schema', True) is not True
            or request.get('require_clean_schema') is not True):
        raise ValueError('The Q8 KV profile requires the original GPU projector and clean structured decoder')


class Qwen4KVMemoryGuard(VisionMemoryGuard):
    def require_start(self):
        self.initial_available = self.sample()
        if self.initial_available < STARTUP_BYTES:
            raise ValueError('At least three GiB physical RAM must be available before this 4B profile')

    def summary(self):
        result = super().summary()
        result['startup_floor_bytes'] = STARTUP_BYTES
        result['profile'] = PROFILE
        return result
