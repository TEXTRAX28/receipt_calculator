"""Decode the pinned llama-cli output-file transcript, without changing OCR values."""


def parse_cli_transcript(transcript, prompt):
    if len(transcript) > 73000 or not prompt or len(prompt) > 12000:
        raise ValueError("Invalid bounded single-turn transcript")
    transcript = transcript.replace("\r\n", "\n")
    prompt = prompt.replace("\r\n", "\n")
    prefix = f"User:\n{prompt}\n\nAssistant:\n"
    if not transcript.startswith(prefix):
        raise ValueError("Native transcript has unexpected role/prompt framing")
    content = transcript[len(prefix):].strip("\n")
    if content.startswith("[Start thinking]\n"):
        raise ValueError("Reasoning is not a document-recognition result")
    if not content.strip() or len(content) > 60000:
        raise ValueError("Empty or oversized document recognition")
    return content
