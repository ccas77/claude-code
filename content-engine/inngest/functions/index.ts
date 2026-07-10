import { health } from "./health";
import { facebookLibraryIngest } from "./facebook-library-ingest";
import { assetOcr } from "./asset-ocr";

export const functions = [health, facebookLibraryIngest, assetOcr];
