"""Durable social feed, private media, ephemeral stories and collections.

SQLite DDL frozen from the reviewed schema; no runtime model imports.
"""
from alembic import op

revision = "0033_social_feed"
down_revision = "0032_interactive_stories"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_story_follows_author", "story_follows", ["author_id"])
    op.execute("""CREATE TABLE social_posts (
    id INTEGER NOT NULL,
    author_user_id INTEGER NOT NULL,
    as_company_id INTEGER,
    kind VARCHAR(24) NOT NULL,
    body TEXT NOT NULL,
    search_text TEXT NOT NULL,
    audience VARCHAR(24) NOT NULL,
    status VARCHAR(24) NOT NULL,
    repost_of_id INTEGER,
    linked_kind VARCHAR(24),
    linked_id VARCHAR(100),
    comments_enabled BOOLEAN NOT NULL,
    pinned_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME,
    published_at DATETIME,
    deleted_at DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY(author_user_id) REFERENCES users (id),
    FOREIGN KEY(as_company_id) REFERENCES companies (id),
    FOREIGN KEY(repost_of_id) REFERENCES social_posts (id)
)""")
    op.execute("""CREATE TABLE social_post_likes (
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES social_posts (id),
    FOREIGN KEY(user_id) REFERENCES users (id)
)""")
    op.execute("""CREATE TABLE social_comments (
    id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    parent_id INTEGER,
    author_user_id INTEGER NOT NULL,
    text VARCHAR(2000) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    edited_at DATETIME,
    deleted_at DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY(post_id) REFERENCES social_posts (id),
    FOREIGN KEY(parent_id) REFERENCES social_comments (id),
    FOREIGN KEY(author_user_id) REFERENCES users (id)
)""")
    op.execute("""CREATE TABLE social_comment_likes (
    comment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (comment_id, user_id),
    FOREIGN KEY(comment_id) REFERENCES social_comments (id),
    FOREIGN KEY(user_id) REFERENCES users (id)
)""")
    op.execute("""CREATE TABLE social_company_follows (
    user_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, company_id),
    FOREIGN KEY(user_id) REFERENCES users (id),
    FOREIGN KEY(company_id) REFERENCES companies (id)
)""")
    op.execute("""CREATE TABLE social_bookmarks (
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY(user_id) REFERENCES users (id),
    FOREIGN KEY(post_id) REFERENCES social_posts (id)
)""")
    op.execute("""CREATE TABLE social_collections (
    id INTEGER NOT NULL,
    owner_user_id INTEGER NOT NULL,
    title VARCHAR(120) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    audience VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY(owner_user_id) REFERENCES users (id)
)""")
    op.execute("""CREATE TABLE social_collection_items (
    id INTEGER NOT NULL,
    collection_id INTEGER NOT NULL,
    post_id INTEGER,
    scenario_id VARCHAR(100),
    position INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (collection_id, post_id),
    UNIQUE (collection_id, scenario_id),
    CONSTRAINT ck_social_collection_target CHECK ((post_id IS NOT NULL) != (scenario_id IS NOT NULL)),
    FOREIGN KEY(collection_id) REFERENCES social_collections (id) ON DELETE CASCADE,
    FOREIGN KEY(post_id) REFERENCES social_posts (id)
)""")
    op.execute("""CREATE TABLE social_collection_follows (
    collection_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (collection_id, user_id),
    FOREIGN KEY(collection_id) REFERENCES social_collections (id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users (id)
)""")
    op.execute("""CREATE TABLE social_mutes (
    owner_user_id INTEGER NOT NULL,
    muted_user_id INTEGER NOT NULL,
    PRIMARY KEY (owner_user_id, muted_user_id),
    FOREIGN KEY(owner_user_id) REFERENCES users (id),
    FOREIGN KEY(muted_user_id) REFERENCES users (id)
)""")
    op.execute("""CREATE TABLE social_poll_options (
    id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    text VARCHAR(200) NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(post_id) REFERENCES social_posts (id)
)""")
    op.execute("""CREATE TABLE social_poll_votes (
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    option_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES social_posts (id),
    FOREIGN KEY(user_id) REFERENCES users (id),
    FOREIGN KEY(option_id) REFERENCES social_poll_options (id)
)""")
    op.execute("""CREATE TABLE social_stories (
    id INTEGER NOT NULL,
    owner_user_id INTEGER NOT NULL,
    as_company_id INTEGER,
    text VARCHAR(1000) NOT NULL,
    background VARCHAR(30) NOT NULL,
    media_id INTEGER,
    audience VARCHAR(24) NOT NULL,
    status VARCHAR(24) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at DATETIME NOT NULL,
    deleted_at DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY(owner_user_id) REFERENCES users (id),
    FOREIGN KEY(as_company_id) REFERENCES companies (id),
    FOREIGN KEY(media_id) REFERENCES social_media (id)
)""")
    op.execute("""CREATE TABLE social_media (
    id INTEGER NOT NULL,
    owner_user_id INTEGER NOT NULL,
    post_id INTEGER,
    story_id INTEGER,
    storage_key VARCHAR(100) NOT NULL,
    mime VARCHAR(80) NOT NULL,
    kind VARCHAR(20) NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_seconds FLOAT,
    bytes INTEGER NOT NULL,
    thumb_key VARCHAR(100),
    alt_text VARCHAR(300) NOT NULL,
    position INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY(owner_user_id) REFERENCES users (id),
    FOREIGN KEY(post_id) REFERENCES social_posts (id),
    FOREIGN KEY(story_id) REFERENCES social_stories (id),
    UNIQUE (storage_key)
)""")
    op.execute("""CREATE TABLE social_story_views (
    story_id INTEGER NOT NULL,
    viewer_id INTEGER NOT NULL,
    first_viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (story_id, viewer_id),
    FOREIGN KEY(story_id) REFERENCES social_stories (id),
    FOREIGN KEY(viewer_id) REFERENCES users (id)
)""")
    op.execute("""CREATE TABLE social_story_highlights (
    id INTEGER NOT NULL,
    owner_user_id INTEGER NOT NULL,
    title VARCHAR(100) NOT NULL,
    cover_media_id INTEGER,
    position INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(owner_user_id) REFERENCES users (id),
    FOREIGN KEY(cover_media_id) REFERENCES social_media (id)
)""")
    op.execute("""CREATE TABLE social_highlight_items (
    highlight_id INTEGER NOT NULL,
    story_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (highlight_id, story_id),
    FOREIGN KEY(highlight_id) REFERENCES social_story_highlights (id) ON DELETE CASCADE,
    FOREIGN KEY(story_id) REFERENCES social_stories (id)
)""")
    op.execute("""CREATE TABLE social_reports (
    id INTEGER NOT NULL,
    reporter_user_id INTEGER NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_id INTEGER NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    status VARCHAR(20) NOT NULL,
    moderator_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at DATETIME,
    PRIMARY KEY (id),
    UNIQUE (reporter_user_id, target_type, target_id),
    FOREIGN KEY(reporter_user_id) REFERENCES users (id),
    FOREIGN KEY(moderator_id) REFERENCES users (id)
)""")
    op.execute("""CREATE TABLE social_preferences (
    user_id INTEGER NOT NULL,
    settings TEXT NOT NULL,
    PRIMARY KEY (user_id),
    FOREIGN KEY(user_id) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_social_posts_audience ON social_posts (audience, status)""")
    op.execute("""CREATE INDEX ix_social_posts_author ON social_posts (author_user_id, status, published_at)""")
    op.execute("""CREATE INDEX ix_social_posts_company ON social_posts (as_company_id, status, published_at)""")
    op.execute("""CREATE INDEX ix_social_posts_feed ON social_posts (status, published_at, id)""")
    op.execute("""CREATE UNIQUE INDEX uq_social_live_repost ON social_posts (author_user_id, repost_of_id) WHERE repost_of_id IS NOT NULL AND status != 'DELETED'""")
    op.execute("""CREATE INDEX ix_social_comments_post ON social_comments (post_id, created_at, id)""")
    op.execute("""CREATE INDEX ix_social_bookmarks_user ON social_bookmarks (user_id, saved_at)""")
    op.execute("""CREATE INDEX ix_social_stories_owner ON social_stories (owner_user_id, expires_at)""")
    op.execute("""CREATE INDEX ix_social_media_owner ON social_media (owner_user_id, created_at)""")
    op.execute("""CREATE INDEX ix_social_media_post ON social_media (post_id)""")
    op.execute("""CREATE INDEX ix_social_media_story ON social_media (story_id)""")


def downgrade():
    # Remove nullable circular media references before dropping ephemeral stories.
    op.execute("UPDATE social_stories SET media_id = NULL")
    op.execute("UPDATE social_media SET story_id = NULL")
    op.drop_table("social_preferences")
    op.drop_table("social_reports")
    op.drop_table("social_highlight_items")
    op.drop_table("social_story_highlights")
    op.drop_table("social_story_views")
    op.drop_table("social_media")
    op.drop_table("social_stories")
    op.drop_table("social_poll_votes")
    op.drop_table("social_poll_options")
    op.drop_table("social_mutes")
    op.drop_table("social_collection_follows")
    op.drop_table("social_collection_items")
    op.drop_table("social_collections")
    op.drop_table("social_bookmarks")
    op.drop_table("social_company_follows")
    op.drop_table("social_comment_likes")
    op.drop_table("social_comments")
    op.drop_table("social_post_likes")
    op.drop_table("social_posts")
    op.drop_index("ix_story_follows_author", table_name="story_follows")
