export {
  createComputeClient,
  createPhysicsClient,
  type ComputeClient,
  type PhysicsClient,
} from './client';
export type { PhysicsFrames, PhysicsInput } from './physics/physicsApi';
export type { ComputeApi, CsvPreviewData, CsvReadOptions, Model3dImport } from './computeApi';
export type { ReportOptions } from './report/pdfReport';
/** Para pasar callbacks (avance) a los workers. */
export { proxy } from 'comlink';
