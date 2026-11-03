/** The shareable demo link is any app URL with `?tour=1`. Returns whether it is present and the query without it. */
export function readTourLink(search: string): { tour: boolean; rest: string } {
  const params = new URLSearchParams(search);
  if (params.get("tour") !== "1") return { tour: false, rest: search };
  params.delete("tour");
  const rest = params.toString();
  return { tour: true, rest: rest ? `?${rest}` : "" };
}
