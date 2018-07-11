const masonryLayout = new Masonry(document.querySelector('.gallery'), {
  itemSelector: '.grid-item',
  columnWidth: '.grid-sizer',
  gutter: '.gutter-sizer',
  percentPosition: true
})

imagesLoaded(document.querySelector('.gallery'), () => {
  masonryLayout.layout()
})

masonryLayout.on('layoutComplete', () => {
  document.querySelector('.gallery').classList.add('masonry')
});

lightGallery(document.getElementById('lightgallery'), {
  selector: '.grid-item'
})

function setImageHeight() {
  document.querySelectorAll('.grid-item img').forEach(image => {
    console.log(image)

    const height = Math.round(image.offsetWidth / image.dataset.aspectRatio);

    image.setAttribute('height', height);
  });
}

// Set image height on page load
setImageHeight();

window.addEventListener('resize', setImageHeight);
