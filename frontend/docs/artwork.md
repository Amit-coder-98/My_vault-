# Artwork

All artwork is in `public/artwork/`; the application makes no runtime requests to image hosts.

## Original featured artwork

**File:** [between-the-tides.webp](../public/artwork/between-the-tides.webp)

Generated with the built-in image generation tool, then optimized to an 800 × 800 WebP (approximately 60 KB). Album lettering is rendered in CSS so it remains crisp in both player sizes.

Final generation prompt:

> Use case: stylized-concept. Asset type: original square album artwork for a premium private music app. Create a cinematic fine art photograph of an immense lavender and indigo ocean at dusk, a subtle peach moon low on the hazy horizon, distant dark mountain silhouette on the right, gently rippled glassy water reflecting lavender light, subtle film grain. Dreamy, introspective indie electronic album aesthetic, editorial photography, sophisticated subdued colors, rich ink-blue shadows, beautifully spacious horizon. Edge-to-edge square composition. No text, no logos, no borders, no UI, no watermark. The album is called Between the Tides; create only the image, no lettering.

## Supporting photographs

Downloaded and optimized local copies of Unsplash photographs are used as fictional album covers. Artist, track, and album names are fictional demonstration data.

| Local file        | Source                                                                           |
| ----------------- | -------------------------------------------------------------------------------- |
| golden-hour.jpg   | [Desert landscape](https://images.unsplash.com/photo-1509316785289-025f5b846b35) |
| into-the-blue.jpg | [Ocean](https://images.unsplash.com/photo-1518837695005-2083093ee35b)            |
| a-quiet-place.jpg | [Forest](https://images.unsplash.com/photo-1441974231531-c6227db76b6e)           |
| after-hours.jpg   | [Night scene](https://images.unsplash.com/photo-1519608487953-e999c86e7455)      |
| slow-bloom.jpg    | [Flowers](https://images.unsplash.com/photo-1490750967868-88aa4486c946)          |

`scripts/prepare-artwork.mjs` can refresh supporting photographs. An optional first argument supplies an existing generated image to optimize as the featured WebP.

The helper resolves its output directory relative to the script, so running it from the project root also writes to `frontend/public/artwork/`.
