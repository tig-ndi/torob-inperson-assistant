"""Production entry point: run from the repository root with python -m tools.serve."""

import os

import uvicorn


def main() -> None:
    try:
        port = int(os.environ.get('PORT', '8000'))
        if not 1 <= port <= 65535:
            raise ValueError()
    except ValueError as exc:
        raise SystemExit('PORT must be an integer from 1 to 65535.') from exc

    from apps.api.main import app
    # Refuse a frontend-less or data-less production start. The same public
    # readiness endpoint remains available to detect storage loss after startup.
    checks = app.state.readiness_check()
    if any(value != 'ready' for value in checks.values()):
        raise SystemExit(f'Production preflight failed: {checks}')
    uvicorn.run(app, host='0.0.0.0', port=port, access_log=False, workers=1)


if __name__ == '__main__':
    main()
