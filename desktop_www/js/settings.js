class Settings {
  constructor(store) {
    this.$settings          = document.getElementById("settings");
    this.$settings_tablinks = this.$settings.querySelectorAll(".sections a");
    this.$settings_tabs     = this.$settings.querySelectorAll(".settings-tab");
    this.$settings_inputs   = this.$settings.querySelectorAll(".setting");
    this.listeners          = false;
    this.store              = store;
    this.loadSettings();
  }

  addListeners() {
    if (!document.body.classList.contains("settings_listeners")) {
      //Switch tabs
      Array.from(this.$settings_tablinks).forEach(el => el.addEventListener("click", e => this.switchTab(e)));
      //Act on setting changes
      Array.from(this.$settings_inputs).forEach(el => el.addEventListener("click", e => this.updateSetting(e.target)));
      document.body.classList.add("settings_listeners");
    }
    this.listeners = true;
  }

  loadSettings() {
    const allPrefs = platform.getAllPrefs();
    for (const prefCat in allPrefs) {
      const $prefCat = document.getElementById(prefCat + "_settings");

      for (const pref in allPrefs[prefCat]) {
        if (allPrefs[prefCat][pref]) {
          document.getElementById(prefCat + "_" + pref).checked = true;
          document.body.classList.add(prefCat + "_" + pref);
        }
      }
    }
    if (!this.listeners) {
      this.addListeners();
    }
  }

  updateSetting(el) {
    const [prefCat, pref] = el.id.split("_");
    let val = null;
    if (el.checked) {
      val = el.value == "on" ? true : el.value;
      document.body.classList.add(el.id);
    } else {
      val = false;
      document.body.classList.remove(el.id);
    }
    platform.setUserPref(prefCat + "." + pref, val)
  }

  openSettings() {
    if (!this.$settings.classList.contains("animated")) {
      this.loadSettings();
      this.$settings.classList.add("animated", "fadeInUp");
      let $inputs = document.querySelectorAll("input, textarea");
      Array.from($inputs).forEach(el => el.blur());
    }
  }

  closeSettings() {
    this.$settings.classList.add("fadeOutDown");
    setTimeout(() => {
      this.$settings.classList.remove("animated", "fadeInUp", "fadeOutDown");
    }, 300);
  }

  switchTab(e) {
    //Make link current
    Array.from(this.$settings_tablinks).forEach(el => el.classList.remove("active"));
    e.currentTarget.classList.add("active");
    //Make tab current
    Array.from(this.$settings_tabs).forEach(el => el.classList.remove("active"));
    document.getElementById(e.currentTarget.dataset.tab).classList.add("active");
  }
}

module.exports = Settings;
