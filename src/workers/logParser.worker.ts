import { ParseWorkerCore, ParseWorkerRequest } from '../services/parseWorkerCore';

const core = new ParseWorkerCore((response) => self.postMessage(response));

self.onmessage = (event: MessageEvent<ParseWorkerRequest>) => {
  void core.handle(event.data);
};
