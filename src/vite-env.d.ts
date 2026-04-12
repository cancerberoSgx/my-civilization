/// <reference types="vite/client" />

// Allow `?worker` imports
declare module '*?worker' {
  const W: new () => Worker
  export default W
}
