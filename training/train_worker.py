"""Placeholder for the AI Model Hub fine-tuning worker.

The original server only provided a compatibility allowlist check.
This worker intentionally reports that training is not implemented
rather than claiming a training job completed successfully.
"""

import sys


def main() -> int:
    print(
        "Training worker is not configured yet. Select and test a "
        "fine-tuning backend before enabling training jobs.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())