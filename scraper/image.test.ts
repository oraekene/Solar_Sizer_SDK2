import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { hashImageBytes, imageUrlFromHtml } from './image.ts';

test('the main product image is read from the page', () => {
  const html = '<meta property="og:image" content="https://cdn.test/panel.jpg">';
  assert.equal(imageUrlFromHtml(html, 'https://shop.test/product/1'), 'https://cdn.test/panel.jpg');
});

test('the image fingerprint is stable for the same bytes', () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  assert.equal(hashImageBytes(bytes), hashImageBytes(bytes));
  assert.notEqual(hashImageBytes(bytes), hashImageBytes(new Uint8Array([1, 2, 3, 5])));
});

test('the specialist page chooses the product photo instead of the shop logo', () => {
  const html = fs.readFileSync(new URL('./fixtures/solarshopnigeria-product.html', import.meta.url), 'utf8');
  const url = imageUrlFromHtml(html, 'https://solarshopnigeria.com/products/test');
  assert.ok(url);
  assert.doesNotMatch(url, /logo/i);
  assert.match(url, /cmu1rh7vr0048mx3ff2nb2ufy/i);
});

test('a seller avatar is not treated as the product image', () => {
  const html = fs.readFileSync(new URL('./fixtures/jiji-product.html', import.meta.url), 'utf8');
  assert.equal(imageUrlFromHtml(html, 'https://jiji.ng/product/1'), null);
});
