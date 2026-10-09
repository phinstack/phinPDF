// Asset URLs are resolved by the app's Vite build.
declare module '*?url' {
  const url: string;
  export default url;
}
