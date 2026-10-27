"""Safely extract the project's own release ZIP to a new isolated verification folder."""
import hashlib, json, pathlib, stat, sys, zipfile
root = pathlib.Path(__file__).resolve().parents[1]
archive = pathlib.Path(sys.argv[1]).resolve()
target = pathlib.Path(sys.argv[2]).resolve()
releases = root / 'releases'
if releases not in archive.parents or releases not in target.parents or target.exists():
    raise SystemExit('Use an archive and a new verification folder inside this project releases directory.')
with zipfile.ZipFile(archive) as source:
    manifest = json.loads(source.read('PACKAGE_MANIFEST.json'))
    entries = {entry['path']: entry for entry in manifest['files']}
    if len(source.namelist()) != len(entries) + 1 or set(source.namelist()) != set(entries) | {'PACKAGE_MANIFEST.json'}:
        raise SystemExit('Archive entries do not match its manifest.')
    for item in source.infolist():
        parts = pathlib.PurePosixPath(item.filename.replace('\\', '/')).parts
        resolved = target.joinpath(*parts).resolve()
        if not parts or any(part in ('..', '.') or ':' in part for part in parts) or target not in resolved.parents or stat.S_ISLNK(item.external_attr >> 16):
            raise SystemExit('Unsafe archive member.')
        if item.filename in entries:
            data = source.read(item)
            if len(data) != entries[item.filename]['bytes'] or hashlib.sha256(data).hexdigest() != entries[item.filename]['sha256']:
                raise SystemExit('Checksum mismatch.')
    target.mkdir()
    source.extractall(target)
print(json.dumps({'folder':str(target),'files':len(entries)+1,'checksumsVerified':True}))
