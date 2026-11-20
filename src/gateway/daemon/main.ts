import { startGateway, type GatewayOptions } from './server';

let buffered = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => { buffered += chunk; });
process.stdin.on('end', () => { const options = JSON.parse(buffered) as GatewayOptions; void startGateway(options); });
