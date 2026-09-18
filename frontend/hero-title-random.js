(() => {
  const image = document.querySelector('#hero-title-image');
  const webp = document.querySelector('#hero-title-webp');
  if (!(image instanceof HTMLImageElement) || !(webp instanceof HTMLSourceElement)) return;

  // Only use artwork with complete, uncropped edges.
  const titleVariants = [1, 2, 5, 6, 7, 8, 9, 10, 12, 13, 14, 18, 20];
  const storageKey = 'michel.heroTitle.last';
  const previous = Number.parseInt(sessionStorage.getItem(storageKey) || '', 10);
  const choices = titleVariants.filter(id => id !== previous);
  const selected = choices[Math.floor(Math.random() * choices.length)];

  sessionStorage.setItem(storageKey, String(selected));
  const id = String(selected).padStart(2, '0');
  const base = `./assets/hero-titles/l${id}`;

  webp.srcset = `${base}-836-transparent-v3.webp 836w, ${base}-1672-transparent-v3.webp 1672w`;
  image.src = `${base}-1672-transparent-v3.webp`;
  image.dataset.titleVariant = `L${id}`;
})();
