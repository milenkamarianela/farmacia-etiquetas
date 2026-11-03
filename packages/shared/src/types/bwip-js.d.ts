// bwip-js se usa solo en las pruebas, como referencia independiente para verificar el codificador.
declare module 'bwip-js' {
  interface RenderOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    includetext?: boolean;
  }
  const bwipjs: { toSVG(options: RenderOptions): string };
  export default bwipjs;
}
