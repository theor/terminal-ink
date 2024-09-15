/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="ink" />
// declare var storyContent: string;
declare module "*.ink" {
    const value: string;
    export default value;
  }
