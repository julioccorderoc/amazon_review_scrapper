# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for the Amazon Review Scraper server binary.
#
# Build on macOS:   ./build-macos.sh
# Build on Windows: .\build-windows.ps1
#
# collect_all() is used for uvicorn, fastapi, starlette, and anyio because
# these packages use dynamic imports (plugin loaders, protocol auto-selection)
# that PyInstaller's static analysis misses without it.

from PyInstaller.utils.hooks import collect_all

uvicorn_datas,   uvicorn_binaries,   uvicorn_hiddenimports   = collect_all("uvicorn")
fastapi_datas,   fastapi_binaries,   fastapi_hiddenimports   = collect_all("fastapi")
starlette_datas, starlette_binaries, starlette_hiddenimports = collect_all("starlette")
anyio_datas,     anyio_binaries,     anyio_hiddenimports     = collect_all("anyio")

a = Analysis(
    ["serve_entry.py"],
    pathex=["."],          # project root — lets PyInstaller resolve the src/ package
    binaries=(
        uvicorn_binaries + fastapi_binaries + starlette_binaries + anyio_binaries
    ),
    datas=(
        uvicorn_datas + fastapi_datas + starlette_datas + anyio_datas
    ),
    hiddenimports=(
        uvicorn_hiddenimports
        + fastapi_hiddenimports
        + starlette_hiddenimports
        + anyio_hiddenimports
        + [
            # lxml: _elementpath must be explicit — static analysis misses it
            "lxml._elementpath",
            "lxml.etree",
            # bs4 / beautifulsoup4
            "bs4",
            "bs4.builder._lxml",
            "bs4.builder._htmlparser",
            # pydantic v2
            "pydantic",
            "pydantic.v1",
            # h11 (HTTP/1.1 implementation used by uvicorn)
            "h11",
            "h11._connection",
            "h11._events",
            # email / multipart support pulled in by starlette
            "email.mime.multipart",
            "email.mime.text",
        ]
    ),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Optional heavy packages we don't use
        "tkinter",
        "matplotlib",
        "numpy",
        "pandas",
        "PIL",
        "scipy",
        "IPython",
        "jupyter",
        "notebook",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="amazon-review-scraper",  # .exe appended automatically on Windows
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,   # UPX can cause false-positive AV warnings on Windows — leave off
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,            # keep the terminal window open (shows server logs)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
