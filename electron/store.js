const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const configPath = path.join(app.getPath('userData'), 'config.json');

function load() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {}
  return {};
}

function save(data) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

module.exports = {
  get(key, defaultValue) {
    const data = load();
    return data[key] !== undefined ? data[key] : defaultValue;
  },
  set(key, value) {
    const data = load();
    data[key] = value;
    save(data);
  },
};
