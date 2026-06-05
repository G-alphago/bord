const { sign } = require('@electron/osx-sign');
async function runSign() {
  console.log("Signing app...");
  await sign({
    app: './dist/mac-arm64/2026 중고등부 학생수련회 방명록.app',
    identity: '-',
    identityValidation: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist'
  });
  console.log("Successfully signed app");
}
runSign().catch(console.error);
