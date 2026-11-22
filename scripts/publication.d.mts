export interface PublicationInput { commit: string; runId: string; artifactName: string; sha256: string }
export interface PublicationContext { repository: string; ref: string; event: string }
export interface PublicationIdentity { name: string; publisher: string; version: string }
export function validateInputs(input: PublicationInput, context: PublicationContext): void;
export function validateEnvironment(environment: unknown): void;
export function validateSelection(input: PublicationInput, context: PublicationContext, workflow: unknown, run: unknown, artifacts: unknown[], jobs: unknown[]): number;
export function validateIdentity(manifest: unknown, xmlManifest: unknown, expected: PublicationIdentity): void;
export function verifyVsix(directory: string, sha256: string, expected: PublicationIdentity): Promise<{path: string; sha256: string; length: number; version: string}>;
