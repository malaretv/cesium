/**
 * Utility function to update querystring in url.
 *
 * takes a `params` object and updates those values in the querystring
 */
export function updateUrlParams(params) {
  if (history.pushState) {
    var url = new URL(window.location);
    for (var [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    window.history.pushState({}, "", url);
  } else {
    console.log("browser does not support querystring updating");
  }
}
