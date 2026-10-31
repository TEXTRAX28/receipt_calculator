// Preserve Vite 8.3.5's default secret patterns while denying project-private data.
export const privateFileDeny = [
  ".env",
  ".env.*",
  "*.{crt,pem,key,p12,pfx,cer,der}",
  ".npmrc",
  ".yarnrc.yml",
  "**/.git",
  "**/.git/**",
  "**/private-receipts/**",
  "**/receipt_training/**",
  "**/qa-artifacts/**",
  "**/graphify-out/**",
  "**/.graphify*",
  "**/.graphify*/**",
  "**/.cache/**",
  "**/test-results/**",
  "**/playwright-report/**",
];
