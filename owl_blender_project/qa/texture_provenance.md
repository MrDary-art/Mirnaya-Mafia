# Текстуры новой совы

Созданы встроенным инструментом image_gen (режим built-in) специально для этого
проекта. Это сгенерированные изображения материала с фотографической фактурой,
а не фотографии реальной совы. API-ключи и сторонние платные генераторы не использовались.
Файлы включены в проект и упакованы в рабочий .blend.

## Грудное оперение

Файл: `work/owl_breast_texture_v1.png`.

Prompt:
> Use case: photorealistic-natural. Asset type: seamless tiling PBR base-color texture for a 3D owl character's breast. A square edge-to-edge surface swatch only: densely overlapping small natural Eurasian eagle owl breast feathers, each feather about 3-5 cm long in real scale, muted cream, warm gray and brown with fine dark vertical streaks and tiny mottled flecks. Photographically detailed feather filaments and subtle variation, evenly lit neutral diffuse light, perfectly frontal flat orthographic material scan, consistent scale over the whole tile. All four edges must tile seamlessly. No whole bird, no eyes, no body outline, no background, no cast shadows, no depth-of-field blur, no text, no watermark.

## Крылья и спина

Файл: `work/owl_wing_texture_v1.png`.

Prompt:
> Use case: photorealistic-natural. Asset type: seamless tiling PBR base-color texture for the wide wings of a realistic 3D Eurasian eagle owl character. A square edge-to-edge material swatch only: tightly overlapping long flight and covert feathers running vertically through the image, charcoal brown and warm slate gray with precise alternating muted buff transverse bars, dark central shafts and very fine separate feather barbs; subtle natural irregularity and tiny soft-edge feather tips. Natural owl plumage, no iridescence, no plastic, no whole bird, no wing silhouette, no eyes, no background. Perfectly frontal flat orthographic material scan under evenly distributed neutral diffuse light, no cast shadows, no depth of field, all four edges tile seamlessly, no text or watermark.

Результат используется как base color. Слабый bump вычисляется из яркости в
материалах Blender; это художественный эффект, не измеренная карта высоты.
