import { describe,it,expect } from 'vitest';
import { containsReleaseSecret, forbiddenReleasePath } from '../../src/lib/security/release';
describe('source release safeguards',()=>{
  it('rejects generated folders, environment secrets, database files and traversal on Windows and POSIX',()=>{
    for(const file of ['node_modules/x.js','.next/server.js','.git/config','src/.env.local','DATA.SQLITE','key.PEM','releases/old/file.txt','src\\..\\secret.json','../file.ts','C:\\secret.json','/secret.json','.env.production'])expect(forbiddenReleasePath(file),file).toBe(true);
    for(const file of ['src/app/page.tsx','.github/workflows/ci.yml','.gitignore','.env.example','docs/demo/AdMorph-demo.mp4','package-lock.json'])expect(forbiddenReleasePath(file),file).toBe(false);
  });
  it('detects supported credential formats without printing token values',()=>{
    for(const secret of ['AIza'+'a'.repeat(35),'gho_'+'b'.repeat(40),'github_pat_'+'c'.repeat(60),'sk-or-v1-'+'d'.repeat(64),'-----BEGIN '+'RSA PRIVATE KEY-----'])expect(containsReleaseSecret(secret)).toBe(true);
    expect(containsReleaseSecret('fixture-key-not-real; keys must not be exported; apiKey: string')).toBe(false);
  });
});
