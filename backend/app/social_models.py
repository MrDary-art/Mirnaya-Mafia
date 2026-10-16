"""Durable social feed metadata; user follows reuse the existing story follow graph."""
from datetime import datetime
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base
from app.story_models import StoryFollow as SocialUserFollow

Index("ix_story_follows_author", SocialUserFollow.author_id)


class SocialPost(Base):
    __tablename__ = "social_posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    as_company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    kind: Mapped[str] = mapped_column(String(24), default="TEXT")
    body: Mapped[str] = mapped_column(Text, default="")
    search_text: Mapped[str] = mapped_column(Text, default="")
    audience: Mapped[str] = mapped_column(String(24), default="PUBLIC")
    status: Mapped[str] = mapped_column(String(24), default="PUBLISHED")
    repost_of_id: Mapped[int | None] = mapped_column(ForeignKey("social_posts.id"))
    linked_kind: Mapped[str | None] = mapped_column(String(24))
    linked_id: Mapped[str | None] = mapped_column(String(100))
    comments_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    __table_args__ = (Index("ix_social_posts_feed", "status", "published_at", "id"),
        Index("ix_social_posts_author", "author_user_id", "status", "published_at"),
        Index("ix_social_posts_company", "as_company_id", "status", "published_at"),
        Index("ix_social_posts_audience", "audience", "status"),
        Index("uq_social_live_repost", "author_user_id", "repost_of_id", unique=True,
              sqlite_where=text("repost_of_id IS NOT NULL AND status != 'DELETED'")))


class SocialPostLike(Base):
    __tablename__ = "social_post_likes"
    post_id: Mapped[int] = mapped_column(ForeignKey("social_posts.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SocialComment(Base):
    __tablename__ = "social_comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("social_posts.id"))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("social_comments.id"))
    author_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(String(2000))
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    edited_at: Mapped[datetime | None] = mapped_column(DateTime)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    __table_args__ = (Index("ix_social_comments_post", "post_id", "created_at", "id"),)


class SocialCommentLike(Base):
    __tablename__ = "social_comment_likes"
    comment_id: Mapped[int] = mapped_column(ForeignKey("social_comments.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SocialCompanyFollow(Base):
    __tablename__ = "social_company_follows"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SocialBookmark(Base):
    __tablename__ = "social_bookmarks"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("social_posts.id"), primary_key=True)
    saved_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    __table_args__ = (Index("ix_social_bookmarks_user", "user_id", "saved_at"),)


class SocialCollection(Base):
    __tablename__ = "social_collections"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(1000), default="")
    audience: Mapped[str] = mapped_column(String(20), default="PRIVATE")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)


class SocialCollectionItem(Base):
    __tablename__ = "social_collection_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    collection_id: Mapped[int] = mapped_column(ForeignKey("social_collections.id", ondelete="CASCADE"))
    post_id: Mapped[int | None] = mapped_column(ForeignKey("social_posts.id"))
    scenario_id: Mapped[str | None] = mapped_column(String(100))
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint("collection_id", "post_id"), UniqueConstraint("collection_id", "scenario_id"),
                     CheckConstraint("(post_id IS NOT NULL) != (scenario_id IS NOT NULL)", name="ck_social_collection_target"))


class SocialCollectionFollow(Base):
    __tablename__ = "social_collection_follows"
    collection_id: Mapped[int] = mapped_column(ForeignKey("social_collections.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)


class SocialMute(Base):
    __tablename__ = "social_mutes"
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    muted_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)


class SocialPollOption(Base):
    __tablename__ = "social_poll_options"
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("social_posts.id"))
    text: Mapped[str] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(Integer)


class SocialPollVote(Base):
    __tablename__ = "social_poll_votes"
    post_id: Mapped[int] = mapped_column(ForeignKey("social_posts.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    option_id: Mapped[int] = mapped_column(ForeignKey("social_poll_options.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SocialStory(Base):
    __tablename__ = "social_stories"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    as_company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    text: Mapped[str] = mapped_column(String(1000), default="")
    background: Mapped[str] = mapped_column(String(30), default="forest")
    media_id: Mapped[int | None] = mapped_column(ForeignKey("social_media.id"))
    audience: Mapped[str] = mapped_column(String(24), default="PUBLIC")
    status: Mapped[str] = mapped_column(String(24), default="PUBLISHED")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    __table_args__ = (Index("ix_social_stories_owner", "owner_user_id", "expires_at"),)


class SocialMedia(Base):
    __tablename__ = "social_media"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    post_id: Mapped[int | None] = mapped_column(ForeignKey("social_posts.id"))
    story_id: Mapped[int | None] = mapped_column(ForeignKey("social_stories.id"))
    storage_key: Mapped[str] = mapped_column(String(100), unique=True)
    mime: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(20))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[float | None]
    bytes: Mapped[int] = mapped_column(Integer)
    thumb_key: Mapped[str | None] = mapped_column(String(100))
    alt_text: Mapped[str] = mapped_column(String(300), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    __table_args__ = (Index("ix_social_media_post", "post_id"), Index("ix_social_media_story", "story_id"),
                     Index("ix_social_media_owner", "owner_user_id", "created_at"))


class SocialStoryView(Base):
    __tablename__ = "social_story_views"
    story_id: Mapped[int] = mapped_column(ForeignKey("social_stories.id"), primary_key=True)
    viewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    first_viewed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SocialHighlight(Base):
    __tablename__ = "social_story_highlights"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(100))
    cover_media_id: Mapped[int | None] = mapped_column(ForeignKey("social_media.id"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SocialHighlightItem(Base):
    __tablename__ = "social_highlight_items"
    highlight_id: Mapped[int] = mapped_column(ForeignKey("social_story_highlights.id", ondelete="CASCADE"), primary_key=True)
    story_id: Mapped[int] = mapped_column(ForeignKey("social_stories.id"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class SocialReport(Base):
    __tablename__ = "social_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    target_type: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    moderator_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    __table_args__ = (UniqueConstraint("reporter_user_id", "target_type", "target_id"),)


class SocialPreference(Base):
    __tablename__ = "social_preferences"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    settings: Mapped[str] = mapped_column(Text, default="{}")
