-- Code-review finding (issue #37): 0038 set the 'gallery' bucket's hard
-- file_size_limit ceiling to 5MB, but createAlbum() (and its form) let a
-- School Owner configure a per-album max_image_size_bytes up to 20MB — any
-- album configured above 5MB would have every upload above 5MB silently
-- rejected by Storage itself, breaking the "configurable, not hardcoded" cap
-- (PRD §5.8/§7). Raise the ceiling to match the top of the configurable
-- range; the per-album trigger (enforce_gallery_photo_cap) remains the real,
-- configurable enforcement point below this hard ceiling. Additive only.

update storage.buckets set file_size_limit = 20971520 where id = 'gallery';
