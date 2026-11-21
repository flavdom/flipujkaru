/* Data zapečená do HTML při prerenderu (texty webu, auta) → první render
   v prohlížeči je stejný jako HTML ze serveru; čerstvá data se dotáhnou hned potom. */
let ssrData = null;
export const setSsrData = (d) => { ssrData = d; };
export const initialData = () => (typeof window !== 'undefined' ? window.__INITIAL__ : ssrData) || {};
