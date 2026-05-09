export const getRouteParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[value.length - 1] : value;
