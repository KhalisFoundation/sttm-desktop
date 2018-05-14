function changeDonationInput() {
  document.getElementById('donation-text-input').value = this.value;
  document.querySelector('input[name="a3"]').value = this.value;
}

const radioInputs = document.getElementsByClassName('donation-choice');
[...radioInputs].forEach(el => el.addEventListener('change', changeDonationInput));

function recurringPayment() {
  if (this.checked) {
    document.querySelector('input[name="cmd"]').value = '_xclick-subscriptions';
  } else {
    document.querySelector('input[name="cmd"]').value = '_donations';
  }
}
document.getElementById('recurring-option').onchange = recurringPayment;

function showLoader() {
  const loader = document.getElementsByClassName('preloader')[0];
  loader.innerHTML = `<div class="loader">
                        <div></div><div></div><div></div><div></div>
                        <div></div><div></div><div></div><div></div>
                        <div></div><div></div>
                      </div>`;
  loader.style.display = 'block';
}

document.getElementById('donate-now').onclick = showLoader;
