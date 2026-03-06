# PyInstaller entry point for the Amazon Review Scraper server.
#
# Critical patterns for PyInstaller + uvicorn --onefile:
#   1. multiprocessing.freeze_support() must be called first (required on Windows).
#   2. The FastAPI app must be imported directly — NOT via a string module path.
#      uvicorn.run("src.phase2.server:app", ...) breaks in frozen binaries because
#      the string path is resolved at import-time and the module loader isn't available.
#   3. All imports that touch application code live inside __main__ so the spec's
#      hidden-import collection can trace them correctly.

import multiprocessing

if __name__ == "__main__":
    multiprocessing.freeze_support()

    import logging
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")

    from src.phase2.server import app  # noqa: E402
    import uvicorn  # noqa: E402

    print("Amazon Review Scraper server starting on http://localhost:8765 ...")
    print("Leave this window open while using the Chrome extension.")
    print("Press Ctrl+C (or close this window) to stop.")
    print()

    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
