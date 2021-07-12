/**
 * Utility function to update querystring in url.
 *
 * takes a `params` object and updates those values in the querystring
 */
export function updateUrlParams(params) {
  if (history.pushState) {
    var url = new URL(window.location);
    // remove undefined url params
    url.searchParams.forEach(function (value, key) {
      if (params[key] === undefined) {
        // remove param
        url.searchParams.delete(key);
      }
    });
    for (var [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    window.history.pushState({}, "", url);
  } else {
    console.log("browser does not support querystring updating");
  }
}
