"""Package UTF-8 filenames and Unix symlinks, including macOS app frameworks."""
import os
import stat
import sys
import time
import zipfile
from pathlib import Path

source, destination = map(Path, sys.argv[1:])
with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    def add(file):
        name = str(file.relative_to(source.parent)).replace(os.sep, '/')
        if file.is_symlink():
            info = zipfile.ZipInfo(name, time.localtime(file.lstat().st_mtime)[:6])
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(info, os.readlink(file).encode('utf-8'))
        else:
            archive.write(file, name)
    add(source)
    for directory, folders, files in os.walk(source, followlinks=False):
        for name in sorted(folders + files):
            add(Path(directory) / name)
