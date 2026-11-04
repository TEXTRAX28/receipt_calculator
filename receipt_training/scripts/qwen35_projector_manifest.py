"""Exact provenance for the local Q8 projector; never a production default."""
import json

from setup_qwen35_candidate import ROOT, manifest as base_manifest

MANIFEST = ROOT / 'receipt_training/evaluation/qwen35-2b-q8-projector-manifest.json'
PROJECTOR_BYTES = 361518784
PROJECTOR_SHA256 = '3dc9c77a3323342e6a08b85cf715bf8d8d20704fb50723ba2458487703cb9c24'
QUANTIZER_SHA256 = '3c045bd055736deba6713cd577552917e556e90f4de8757beb42396891cb91d0'


def expected_manifest():
    value = base_manifest()
    source = value['files'][1]
    value['projector_quantization'] = 'Q8_0'
    value['local_derivative'] = True
    value['files'][1] = {
        'path': 'qwen35-2b/mmproj-Q8_0-local.gguf',
        'bytes': PROJECTOR_BYTES, 'sha256': PROJECTOR_SHA256,
        'derived_from': source, 'quantizer_sha256': QUANTIZER_SHA256,
        'quantizer_options': ['--max-buffer-size', '64', '--pure'],
        'quantizer_type': 'Q8_0', 'quantizer_threads': 4,
    }
    return value


def manifest():
    value = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if value != expected_manifest():
        raise ValueError('The locally derived Q8 projector requires exact frozen provenance')
    return value
