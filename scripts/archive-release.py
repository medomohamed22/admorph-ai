"""Create and independently verify a manifest-addressed source ZIP, retaining dotfiles."""
import hashlib, json, pathlib, sys, zipfile
folder = pathlib.Path(sys.argv[1]).resolve()
manifest = json.loads((folder / 'PACKAGE_MANIFEST.json').read_text(encoding='utf-8'))
archive = folder.parent / (folder.name + '.zip')
if archive.exists():
    raise SystemExit('Archive already exists; use a newly prepared folder.')
expected = {item['path']: item for item in manifest['files']}
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=8) as output:
    for name in [*expected, 'PACKAGE_MANIFEST.json']:
        target = (folder / name).resolve()
        if folder not in target.parents or target.is_symlink():
            raise SystemExit('Invalid manifest path')
        output.write(target, name)
with zipfile.ZipFile(archive) as source:
    if set(source.namelist()) != set(expected) | {'PACKAGE_MANIFEST.json'} or source.testzip():
        raise SystemExit('Archive entry validation failed')
    for name, entry in expected.items():
        data = source.read(name)
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise SystemExit('Archive checksum mismatch: ' + name)
print(json.dumps({'archive':str(archive),'files':len(expected)+1,'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}))
