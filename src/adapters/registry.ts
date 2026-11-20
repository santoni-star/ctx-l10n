import { AdapterType } from '../core/types.js';
import { FormatAdapter } from './adapter.js';
import { androidXmlAdapter } from './androidXml.js';
import { jsonAdapter } from './jsonAdapter.js';
import { markdownAdapter } from './markdownAdapter.js';

const ADAPTERS: Record<AdapterType, FormatAdapter> = {
  'android-xml': androidXmlAdapter,
  json: jsonAdapter,
  markdown: markdownAdapter,
};

export function getAdapter(type: AdapterType): FormatAdapter {
  const adapter = ADAPTERS[type];
  if (!adapter) {
    throw new Error(`Unsupported adapter: ${type}`);
  }
  return adapter;
}
