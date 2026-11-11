/* Presentation vocabulary; source files, IDs and annotation offsets stay intact. */
globalThis.BibleTerms = (() => {
  const text = value => String(value ?? "").replace(/침례/g, "세례");
  const fields = new Set(["btext","analysis","htext","title","lyrics","text","name","meaning","definition","gloss"]);
  function content(value) {
    if (Array.isArray(value)) return value.map(content);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,
      typeof item === "string" && fields.has(key) ? text(item) : content(item)]));
  }
  return {text,content};
})();
