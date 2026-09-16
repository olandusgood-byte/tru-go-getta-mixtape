create index if not exists tgg_world_inventory_character_id_idx on public.tgg_world_inventory(character_id);
create index if not exists tgg_world_inventory_item_key_idx on public.tgg_world_inventory(item_key);

create index if not exists world_parties_current_instance_id_idx on public.world_parties(current_instance_id);
create index if not exists world_parties_leader_user_id_idx on public.world_parties(leader_user_id);
create index if not exists world_parties_voice_room_id_idx on public.world_parties(voice_room_id);

create index if not exists tgg_world_v11_7_movement_witness_source_presence_id_idx on private.tgg_world_v11_7_movement_witness(source_presence_id);
create index if not exists tgg_world_v11_7_movement_witness_source_user_id_idx on private.tgg_world_v11_7_movement_witness(source_user_id);

create index if not exists tgg_world_social_posts_character_id_idx on public.tgg_world_social_posts(character_id);
create index if not exists tgg_world_social_comments_post_id_idx on public.tgg_world_social_comments(post_id);
create index if not exists tgg_world_social_comments_user_id_idx on public.tgg_world_social_comments(user_id);
create index if not exists tgg_world_social_reactions_user_id_idx on public.tgg_world_social_reactions(user_id);
