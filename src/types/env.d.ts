declare module 'virtual:lib-code' {
  export const libCodeMap: Record<string, string>;
}

declare module '*.md' {
  const md: {
    html: string;
  };
  export default md;
}
