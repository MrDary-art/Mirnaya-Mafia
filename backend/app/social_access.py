"""One live ACL for feeds, direct URLs, media, collections and shared previews."""
from dataclasses import dataclass
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import aliased
from fastapi import HTTPException
from app.models import Friendship, User
from app.company_models import Company, CompanyMembership
from app.social_models import SocialCompanyFollow, SocialMute, SocialPost, SocialUserFollow

PUBLISH_ROLES = {"COMPANY_OWNER", "COMPANY_ADMIN", "LND_MANAGER"}


@dataclass
class AccessContext:
    user: User
    friends: set[int]
    blocked: set[int]
    following: set[int]
    companies: set[int]
    managed_companies: set[int]
    followed_companies: set[int]
    muted: set[int]

    @classmethod
    async def load(cls, db, user):
        relations = (await db.scalars(select(Friendship).where(or_(Friendship.user_id == user.id, Friendship.friend_id == user.id)))).all()
        friends, blocked = set(), set()
        for row in relations:
            other = row.friend_id if row.user_id == user.id else row.user_id
            if row.status == "FRIENDS": friends.add(other)
            if row.status == "BLOCKED": blocked.add(other)
        memberships = (await db.scalars(select(CompanyMembership).join(Company).where(
            CompanyMembership.user_id == user.id, CompanyMembership.status == "ACTIVE", Company.status == "ACTIVE"))).all()
        following = set((await db.scalars(select(SocialUserFollow.author_id).where(SocialUserFollow.user_id == user.id))).all())
        followed_companies = set((await db.scalars(select(SocialCompanyFollow.company_id).where(SocialCompanyFollow.user_id == user.id))).all())
        muted = set((await db.scalars(select(SocialMute.muted_user_id).where(SocialMute.owner_user_id == user.id))).all())
        return cls(user, friends - blocked, blocked, following - blocked, {row.company_id for row in memberships},
                   {row.company_id for row in memberships if row.corporate_role in PUBLISH_ROLES}, followed_companies, muted)

    def profile_clause(self, author_id):
        profile = aliased(User)
        return and_(author_id.not_in(self.blocked), or_(author_id == self.user.id, author_id.in_(self.friends),
            exists(select(profile.id).where(profile.id == author_id, profile.profile_visibility == "public"))))

    def audience_clause(self, model, author_field="author_user_id"):
        author = getattr(model, author_field)
        company = model.as_company_id
        personal = and_(company.is_(None), self.profile_clause(author), or_(
            author == self.user.id, model.audience == "PUBLIC",
            and_(model.audience == "FRIENDS", author.in_(self.friends)),
            and_(model.audience == "FOLLOWERS", author.in_(self.following))))
        corporate = and_(company.is_not(None), author.not_in(self.blocked),
            exists(select(Company.id).where(Company.id == company, Company.status == "ACTIVE")), or_(
                model.audience == "PUBLIC",
                and_(model.audience == "FOLLOWERS", company.in_(self.followed_companies | self.managed_companies)),
                and_(model.audience == "COMPANY_INTERNAL", company.in_(self.companies)),
                and_(model.audience == "ONLY_ME", author == self.user.id, company.in_(self.companies))))
        return or_(personal, corporate)

    def post_clause(self, model=SocialPost, *, drafts=False):
        status = model.status == "PUBLISHED"
        if drafts:
            status = or_(status, and_(model.status == "DRAFT", model.author_user_id == self.user.id))
        return and_(status, self.audience_clause(model))

    async def can_view_actor(self, db, owner_id, company_id, audience):
        if owner_id in self.blocked: return False
        if company_id is not None:
            company = await db.get(Company, company_id)
            if not company or company.status != "ACTIVE": return False
            return (audience == "PUBLIC" or audience == "COMPANY_INTERNAL" and company_id in self.companies
                    or audience == "FOLLOWERS" and company_id in self.followed_companies | self.managed_companies
                    or audience == "ONLY_ME" and owner_id == self.user.id and company_id in self.companies)
        if owner_id == self.user.id: return True
        author = await db.get(User, owner_id)
        if not author or author.profile_visibility != "public" and owner_id not in self.friends: return False
        return audience == "PUBLIC" or audience == "FRIENDS" and owner_id in self.friends or audience == "FOLLOWERS" and owner_id in self.following

    def can_edit_post(self, post):
        if post.as_company_id is not None:
            return post.as_company_id in self.managed_companies
        return post.author_user_id == self.user.id

    def require_publisher(self, company_id, audience):
        if company_id is None:
            if audience == "COMPANY_INTERNAL": raise HTTPException(422, "Выберите компанию для внутренней публикации")
        elif company_id not in self.managed_companies:
            raise HTTPException(403, "Для публикации от компании нужна активная управляющая роль")
        elif audience == "FRIENDS":
            raise HTTPException(422, "Для компании доступны публичная, внутренняя аудитория или подписчики")


async def get_post(db, user, post_id, *, context=None, drafts=True):
    context = context or await AccessContext.load(db, user)
    row = await db.scalar(select(SocialPost).where(SocialPost.id == post_id, context.post_clause(drafts=drafts)))
    if row is None: raise HTTPException(404, "Публикация недоступна")
    return row


async def can_view_post(db, user, post, *, context=None):
    context = context or await AccessContext.load(db, user)
    return bool(await db.scalar(select(SocialPost.id).where(SocialPost.id == post.id, context.post_clause())))


async def get_visible_post(db, viewer, post_id):
    return await get_post(db, viewer, post_id, drafts=False)
