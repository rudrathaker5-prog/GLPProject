/**
 * Metro turns `global.css` into NativeWind's style registry; Jest has no such
 * transform and chokes on the `@tailwind` directives. The app's styling is not
 * what these tests assert, so an empty module is the honest stand-in.
 */
module.exports = {};
