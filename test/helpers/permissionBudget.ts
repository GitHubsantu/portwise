// Functional I/O scenarios launch real Windows ACL tools and the .NET reader repeatedly.
// These harness budgets do not change the independently tested 5-second command deadline.
export const PERMISSION_IO_TEST_MS = process.platform === 'win32' ? 30_000 : 5_000;
export const PERMISSION_RETENTION_TEST_MS = process.platform === 'win32' ? 90_000 : 30_000;
