import base64
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


DATA_URL_RE = re.compile(r'^data:(image\/(png|jpeg|gif|webp));base64,(.+)$', re.IGNORECASE | re.DOTALL)
HEX_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')
CUSTOM_AVATAR_START_ID = 11


class AvatarStore:
    def __init__(self, root_dir: Path):
        self.root_dir = Path(root_dir)
        self.catalog_path = self.root_dir / 'backend' / 'data' / 'avatar_catalog.json'
        self.assets_dir = self.root_dir / 'frontend' / 'assets' / 'avatars' / 'custom'
        self.catalog_path.parent.mkdir(parents=True, exist_ok=True)
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        self._catalog = self._load_catalog()

    def _load_catalog(self) -> Dict[str, Any]:
        if not self.catalog_path.exists():
            return {'next_id': CUSTOM_AVATAR_START_ID, 'avatars': []}
        try:
            raw = json.loads(self.catalog_path.read_text(encoding='utf-8'))
        except Exception:
            return {'next_id': CUSTOM_AVATAR_START_ID, 'avatars': []}
        avatars = raw.get('avatars') if isinstance(raw, dict) else []
        next_id = int(raw.get('next_id', CUSTOM_AVATAR_START_ID)) if isinstance(raw, dict) else CUSTOM_AVATAR_START_ID
        if not isinstance(avatars, list):
            avatars = []

        normalized: List[Dict[str, Any]] = []
        seen_ids = set()
        max_id = CUSTOM_AVATAR_START_ID - 1
        for row in avatars:
            if not isinstance(row, dict):
                continue
            avatar_id = int(row.get('id', 0) or 0)
            if avatar_id < CUSTOM_AVATAR_START_ID or avatar_id in seen_ids:
                continue
            seen_ids.add(avatar_id)
            max_id = max(max_id, avatar_id)
            normalized.append(row)

        safe_next_id = max(CUSTOM_AVATAR_START_ID, next_id, max_id + 1)
        return {'next_id': safe_next_id, 'avatars': normalized}

    def _save_catalog(self) -> None:
        self.catalog_path.write_text(
            json.dumps(self._catalog, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )

    def list_custom_avatars(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for row in self._catalog.get('avatars', []):
            avatar_id = int(row.get('id', 0) or 0)
            if avatar_id <= 0:
                continue
            rows.append(
                {
                    'id': avatar_id,
                    'name': str(row.get('name', '') or '').strip() or f'Custom {avatar_id}',
                    'color': str(row.get('color', '#9aa4ad') or '#9aa4ad'),
                    'imageSrc': str(row.get('image_src', '') or ''),
                    'isCustom': True,
                }
            )
        rows.sort(key=lambda item: int(item['id']))
        return rows

    def _decode_data_url(self, image_data_url: str) -> Tuple[str, bytes]:
        match = DATA_URL_RE.match(str(image_data_url or '').strip())
        if not match:
            raise ValueError('unsupported image payload')
        mime_type = match.group(1).lower()
        payload = match.group(3)
        try:
            content = base64.b64decode(payload, validate=True)
        except Exception as exc:
            raise ValueError('invalid image payload') from exc
        if not content:
            raise ValueError('empty image payload')
        if len(content) > 1024 * 1024:
            raise ValueError('image payload too large')
        return mime_type, content

    def _extension_for(self, mime_type: str) -> str:
        mapping = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/gif': '.gif',
            'image/webp': '.webp',
        }
        ext = mapping.get(mime_type)
        if not ext:
            raise ValueError('unsupported image type')
        return ext

    def upload_avatar(self, trip: str, name: str, color: str, image_data_url: str) -> Dict[str, Any]:
        trip_key = str(trip or '').strip()
        name_key = str(name or '').strip()
        color_key = str(color or '').strip() or '#9aa4ad'
        if not trip_key:
            raise ValueError('trip is required')
        if not name_key:
            raise ValueError('avatar name is required')
        if len(name_key) > 20:
            raise ValueError('avatar name exceeds limit')
        if not HEX_COLOR_RE.match(color_key):
            raise ValueError('invalid avatar color')

        mime_type, content = self._decode_data_url(image_data_url)
        used_ids = {
            int(row.get('id', 0) or 0)
            for row in self._catalog.get('avatars', [])
            if int(row.get('id', 0) or 0) >= CUSTOM_AVATAR_START_ID
        }
        avatar_id = int(self._catalog.get('next_id', CUSTOM_AVATAR_START_ID) or CUSTOM_AVATAR_START_ID)
        while avatar_id in used_ids:
            avatar_id += 1
        ext = self._extension_for(mime_type)
        file_name = f'{avatar_id}{ext}'
        file_path = self.assets_dir / file_name
        file_path.write_bytes(content)

        image_src = f'./assets/avatars/custom/{file_name}'
        created_date = datetime.now(timezone.utc).isoformat()
        row = {
            'id': avatar_id,
            'name': name_key,
            'color': color_key,
            'image_src': image_src,
            'owner_trip': trip_key,
            'created_date': created_date,
        }
        self._catalog.setdefault('avatars', []).append(row)
        self._catalog['next_id'] = avatar_id + 1
        self._save_catalog()
        return {
            'id': avatar_id,
            'name': name_key,
            'color': color_key,
            'imageSrc': image_src,
            'isCustom': True,
            'created_date': created_date,
        }