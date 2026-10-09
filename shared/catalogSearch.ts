export function normalizeSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("nl")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function compareVersions(a: string, b: string): number {
  const av = a.split(".").map(Number),
    bv = b.split(".").map(Number);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const d = (av[i] ?? 0) - (bv[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
export type RouteCode = "P" | "G" | "Z" | "S" | "+" | "A" | "V";
export function parseCatalogSearch(
  input: string,
  groups: { code: string; title: string }[],
  routes: { code: RouteCode; title: string }[],
) {
  let search = normalizeSearch(input);
  let groupCode: string | undefined;
  let routeCode: RouteCode | undefined;
  function remove(phrase: string) {
    const needle = ` ${normalizeSearch(phrase)} `;
    const wrapped = ` ${search} `;
    if (needle.trim() && wrapped.includes(needle)) {
      search = wrapped.replace(needle, " ").trim().replace(/ +/g, " ");
      return true;
    }
    return false;
  }
  for (const group of [...groups].sort(
    (a, b) => b.title.length - a.title.length,
  ))
    if (remove(group.title)) {
      groupCode = group.code;
      break;
    }
  if (!groupCode)
    for (const group of groups)
      if (remove(group.code)) {
        groupCode = group.code;
        break;
      }
  if (input.trim() === "+") {
    routeCode = "+";
    search = "";
  } else
    for (const route of [...routes].sort(
      (a, b) => b.title.length - a.title.length,
    ))
      if (remove(route.title)) {
        routeCode = route.code;
        break;
      }
  return {
    search: search.split(/\s+/).filter(Boolean).slice(0, 16).join(" "),
    groupCode,
    routeCode,
  };
}
export function matchesSearchTerms(searchText: string, query: string): boolean {
  const terms = query.split(" ").filter(Boolean),
    words = searchText.split(" ");
  return terms.every((term, index) =>
    words.some((word) =>
      index === terms.length - 1 ? word.startsWith(term) : word === term,
    ),
  );
}
