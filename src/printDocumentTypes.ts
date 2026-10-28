export type PrintableDocument={title:string;classification:string;metadata:Record<string,string|number>;sections:Array<{title:string;body:string;links?:Array<{title:string;url:string}>}>}
