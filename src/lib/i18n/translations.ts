import type { Language, Translatable } from '@/types';

/** Language options offered by the switcher. English is the default. */
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'zh', label: '中' },
];

/**
 * Render member-authored text in the reader's language.
 *
 * Falls through to whatever translation exists rather than returning empty:
 * these values are keyed by the UI language at the moment they were typed, so
 * a listing written while the app was in Chinese has only a `zh` key. Stopping
 * at `en` made those titles and descriptions render blank — the post simply
 * vanished for English readers. Showing the original is always better than
 * showing nothing.
 */
export function t(obj: Translatable | string | null | undefined, lang: Language = 'en'): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (obj[lang]) return obj[lang];
  if (obj.en) return obj.en;
  return Object.values(obj).find((v) => typeof v === 'string' && v.trim()) ?? '';
}

export const CATEGORIES = [
  { id: 'craft' as const, en: 'Craft & Making', zh: '手作' },
  { id: 'nature' as const, en: 'Nature & Outdoors', zh: '自然' },
  { id: 'mind' as const, en: 'Mind & People', zh: '心理与人' },
  { id: 'build' as const, en: 'Building & Tech', zh: '科技' },
  { id: 'money' as const, en: 'Deals & Money', zh: '资本' },
  { id: 'art' as const, en: 'Art & Culture', zh: '艺术' },
];

export const UI_STRINGS: Record<string, Record<Language, string>> = {
  // Navigation
  'nav.home': { en: 'Home', zh: '首页' },
  'nav.people': { en: 'People', zh: '成员' },
  'nav.market': { en: 'Market', zh: '市场' },
  'nav.you': { en: 'You', zh: '我' },

  // Auth
  'auth.invitation_only': { en: 'Invitation only', zh: '仅限邀请' },
  'auth.email': { en: 'Email', zh: '邮箱' },
  'auth.send_code': { en: 'Send verification code', zh: '发送验证码' },
  'auth.sending': { en: 'Sending...', zh: '发送中…' },
  'auth.verification_code': { en: 'Verification code', zh: '验证码' },
  'auth.enter_code': { en: 'Enter the 6-digit code.', zh: '请输入 6 位验证码。' },
  'auth.verify': { en: 'Verify & enter', zh: '验证并进入' },
  'auth.verifying': { en: 'Verifying...', zh: '验证中…' },
  'auth.check_email': { en: 'Check your email', zh: '查收邮件' },
  'auth.code_sent': { en: 'We sent a 6-digit code to', zh: '我们已发送 6 位验证码至' },
  'auth.different_email': { en: 'Use a different email', zh: '换一个邮箱' },
  'auth.tagline': {
    en: 'The Republic exists through human connection. It gets out of the way once you’ve met.',
    zh: '共和国存在于人的连接之中；一旦你们见了面，它就让路。',
  },
  'auth.republic_desc': { en: 'A republic without borders', zh: '一个没有疆域的共和国' },
  'auth.members_desc': {
    en: 'The Republic has 116 members across two classes. Enter the email your invitation was sent to.',
    zh: '共和国目前有两届共 116 位成员。请输入收到邀请的邮箱。',
  },
  'auth.valid_email': { en: 'Enter a valid email address.', zh: '请输入有效邮箱。' },
  'auth.code_expires': { en: 'It expires in 10 minutes.', zh: '10 分钟内有效。' },
  'auth.sign_out': { en: 'Sign out', zh: '退出登录' },

  // Home
  'home.morning': { en: 'Good morning', zh: '早上好' },
  'home.afternoon': { en: 'Good afternoon', zh: '下午好' },
  'home.evening': { en: 'Good evening', zh: '晚上好' },
  'home.welcome': { en: 'Welcome', zh: '欢迎' },
  'home.explorer': { en: 'Explorer', zh: '探索者' },
  'home.discover': { en: 'Discover someone new', zh: '发现新朋友' },
  'home.shuffle': { en: 'Shuffle', zh: '换一个' },
  'home.hidden_world_day': { en: 'Hidden World of the day', zh: '今日隐藏世界' },
  'home.may_not_know': { en: 'You may not know them yet', zh: '你可能还不认识他们' },
  'home.in_market': { en: 'In the Market now', zh: '市场动态' },
  'home.see_all': { en: 'See all', zh: '查看全部' },
  'home.first_member': { en: 'You’re the first member here. More arrive soon.', zh: '你是第一位成员，更多人即将加入。' },

  // People
  'people.title': { en: 'People', zh: '成员' },
  'people.search': { en: 'Search people, interests, skills...', zh: '搜索成员、兴趣、技能…' },
  'people.all': { en: 'All', zh: '全部' },
  'people.count': { en: 'people', zh: '位成员' },
  'people.none': { en: 'No people found', zh: '没有找到成员' },
  'people.adjust': { en: 'Try adjusting your filters', zh: '试试调整筛选条件' },

  // Dossier
  'dossier.title': { en: 'Dossier', zh: '档案' },
  'dossier.about': { en: 'About', zh: '简介' },
  'dossier.hidden_worlds': { en: 'Hidden Worlds', zh: '隐藏世界' },
  'dossier.ask_me': { en: 'Ask me about', zh: '可以问我' },
  'dossier.i_want': { en: 'I want to', zh: '我想要' },
  'dossier.languages': { en: 'Languages', zh: '语言' },
  'dossier.preferred_contact': { en: 'Preferred contact', zh: '联系方式' },
  'dossier.connect_with': { en: 'Connect with', zh: '联系' },
  'dossier.not_found': { en: 'Profile not found', zh: '未找到该档案' },
  'dossier.go_back': { en: 'Go back', zh: '返回' },
  'dossier.featured': { en: 'Featured', zh: '精选' },
  'dossier.in_class': { en: 'In-class', zh: '课堂内' },
  'dossier.copied': {
    en: 'WeChat ID copied — paste it into WeChat search',
    zh: '微信号已复制 — 请在微信搜索中粘贴',
  },
  'dossier.copy_failed': { en: 'Could not copy — WeChat ID is', zh: '复制失败，微信号为' },
  'dossier.class_only': { en: 'They prefer to meet in class.', zh: '他们更希望在课堂上见面。' },
  'dossier.no_contact': { en: 'No contact details on file yet.', zh: '尚未填写联系方式。' },

  // Market
  'market.title': { en: 'Market', zh: '市场' },
  'market.new': { en: 'New', zh: '新建' },
  'market.wanted': { en: 'Wanted', zh: '寻求' },
  'market.offers': { en: 'Offers', zh: '提供' },
  'market.matches': { en: 'Matches', zh: '配对' },
  'market.no_wanted': { en: 'No wanted listings yet', zh: '暂无寻求信息' },
  'market.no_offers': { en: 'No offers yet', zh: '暂无提供信息' },
  'market.no_matches': { en: 'No matches yet', zh: '暂无配对' },
  'market.spots': { en: 'spots', zh: '名额' },
  'market.interested': { en: 'I’m interested', zh: '我有兴趣' },
  'market.interest_sent': { en: 'Interest sent', zh: '已表达兴趣' },
  'market.your_listing': { en: 'Your listing', zh: '你发布的' },
  'market.interested_count': { en: 'interested', zh: '人感兴趣' },
  'market.status_open': { en: 'Open', zh: '开放中' },
  'market.status_matched': { en: 'Matched', zh: '已配对' },
  'market.requests': { en: 'Requests', zh: '申请' },
  'market.no_requests': { en: 'No one has raised a hand yet.', zh: '还没有人表达兴趣。' },
  'market.accept': { en: 'Accept', zh: '接受' },
  'market.reject': { en: 'Reject', zh: '拒绝' },
  'market.accepted': { en: 'Accepted', zh: '已接受' },
  'market.rejected': { en: 'Rejected', zh: '已拒绝' },
  'market.not_selected': { en: 'Not selected', zh: '未被选中' },
  'market.youre_matched': { en: 'You’re matched', zh: '你已配对' },
  'market.already_matched': { en: 'Already matched', zh: '已完成配对' },
  'market.pick_one': {
    en: 'Accepting one closes this listing to the others.',
    zh: '接受一位后，此信息将对其他人关闭。',
  },
  'market.curator_suggestion': { en: 'Curator suggestion', zh: '策展人推荐' },
  'market.matched': { en: 'Matched', zh: '已配对' },
  'market.next_step': { en: 'Next step:', zh: '下一步：' },
  'market.we_met': { en: 'We met!', zh: '我们见过了！' },
  'market.met': { en: 'Met', zh: '已完成' },
  'market.saving': { en: 'Saving...', zh: '保存中…' },
  'market.express_interest': { en: 'Express interest', zh: '表达兴趣' },
  'market.message_optional': { en: 'Message (optional)', zh: '留言（可选）' },
  'market.why_interested': { en: 'Why are you interested?', zh: '你为什么感兴趣？' },
  'market.send_interest': { en: 'Send interest', zh: '发送' },
  'market.sending': { en: 'Sending...', zh: '发送中…' },
  'market.already_interested': { en: 'You have already expressed interest.', zh: '你已经表达过兴趣了。' },
  'market.new_listing': { en: 'New listing', zh: '新建信息' },
  'market.listing_title': { en: 'Title', zh: '标题' },
  'market.title_placeholder': { en: 'What are you looking for or offering?', zh: '你在寻求或提供什么？' },
  'market.description': { en: 'Description', zh: '描述' },
  'market.desc_placeholder': { en: 'Tell people more...', zh: '再多说一点…' },
  'market.publish': { en: 'Publish to market', zh: '发布到市场' },
  'market.publishing': { en: 'Publishing...', zh: '发布中…' },
  'market.need_title': { en: 'Give your listing a title.', zh: '请填写标题。' },
  'market.profile_loading': { en: 'Your profile is still loading.', zh: '你的档案仍在加载中。' },

  // Profile
  'profile.title': { en: 'Your profile', zh: '我的档案' },
  'profile.identity': { en: 'Identity', zh: '身份' },
  'profile.full_name': { en: 'Full name', zh: '姓名' },
  'profile.native_name': { en: 'Native name', zh: '本地语言姓名' },
  'profile.optional': { en: 'Optional', zh: '选填' },
  'profile.class': { en: 'Class', zh: '班级' },
  'profile.headline': { en: 'Headline', zh: '一句话介绍' },
  'profile.role': { en: 'Role', zh: '职位' },
  'profile.introduction': { en: 'Introduction', zh: '介绍' },
  'profile.personal_intro': { en: 'Personal intro', zh: '个人介绍' },
  'profile.professional': { en: 'Professional context', zh: '专业背景' },
  'profile.hidden_worlds': { en: 'Hidden Worlds', zh: '隐藏世界' },
  'profile.add': { en: 'Add', zh: '添加' },
  'profile.world_name': { en: 'World name', zh: '名称' },
  'profile.world_placeholder': { en: 'e.g. Sourdough baking', zh: '例如：手作面包' },
  'profile.category': { en: 'Category', zh: '类别' },
  'profile.cancel': { en: 'Cancel', zh: '取消' },
  'profile.ask_me': { en: 'Ask me about', zh: '可以问我' },
  'profile.i_want': { en: 'I want to', zh: '我想要' },
  'profile.add_topic': { en: 'Add topic...', zh: '添加话题…' },
  'profile.contact_pref': { en: 'Contact preference', zh: '联系偏好' },
  'profile.method': { en: 'Method', zh: '方式' },
  'profile.contact_value': { en: 'Contact value', zh: '联系方式' },
  'profile.contact_class': { en: 'In-class only', zh: '仅课堂内' },
  'profile.curator_desk': { en: 'Curator desk', zh: '策展台' },
  'profile.save': { en: 'Save changes', zh: '保存' },
  'profile.saving': { en: 'Saving...', zh: '保存中…' },
  'profile.saved': { en: 'Saved!', zh: '已保存！' },
  'profile.loading': { en: 'Loading your profile...', zh: '正在加载你的档案…' },
  'profile.not_found': { en: 'Profile not found', zh: '未找到档案' },
  'profile.not_created': { en: 'Your profile hasn’t been created yet. Please contact a curator.', zh: '你的档案尚未创建，请联系策展人。' },

  // Admin
  'admin.title': { en: 'Curator desk', zh: '策展台' },
  'admin.overview': { en: 'Republic overview', zh: '共和国概览' },
  'admin.profiles': { en: 'Profiles', zh: '成员' },
  'admin.wanted': { en: 'Wanted', zh: '寻求' },
  'admin.offers': { en: 'Offers', zh: '提供' },
  'admin.matches': { en: 'Matches', zh: '配对' },
  'admin.people': { en: 'People', zh: '成员' },
  'admin.listings': { en: 'Listings', zh: '信息' },
  'admin.suggest': { en: 'Suggest', zh: '推荐' },
  'admin.invite': { en: 'Invite', zh: '邀请' },
  'admin.curators_only': { en: 'Curators only', zh: '仅限策展人' },
  'admin.matches_desc': {
    en: 'Undo a pairing if it falls through. The listing reopens and its pending requests become selectable again; anyone the owner rejected stays rejected.',
    zh: '如果配对无法进行，可以取消。该信息将重新开放，待处理的申请可再次选择；被发布者拒绝的人仍保持拒绝状态。',
  },
  'admin.no_matches': { en: 'No matches yet', zh: '暂无配对' },
  'admin.dismatch': { en: 'Dis-match', zh: '取消配对' },
  'admin.dismatching': { en: 'Undoing...', zh: '取消中…' },
  'admin.dismatched': { en: 'Match undone — the listing is open again.', zh: '配对已取消，信息重新开放。' },
  'admin.match_closed': { en: 'Closed', zh: '已关闭' },
  'admin.no_listings': { en: 'No listings yet', zh: '暂无信息' },
  'admin.unassigned': { en: 'Unassigned', zh: '未分配' },
  'admin.feature': { en: 'Feature', zh: '设为精选' },
  'admin.unfeature': { en: 'Unfeature', zh: '取消精选' },
  'admin.activate': { en: 'Reactivate', zh: '重新启用' },
  'admin.deactivate': { en: 'Deactivate', zh: '停用' },
  'admin.suggest_desc': {
    en: 'As a curator, you can suggest a classmate for a “Wanted” listing. The listing owner sees your suggestion with your reason.',
    zh: '作为策展人，你可以为「寻求」信息推荐一位同学。发布者会看到你的推荐及理由。',
  },
  'admin.wanted_listing': { en: 'Wanted listing', zh: '寻求信息' },
  'admin.select_listing': { en: 'Select a listing...', zh: '选择一条信息…' },
  'admin.suggest_classmate': { en: 'Suggest classmate', zh: '推荐同学' },
  'admin.select_person': { en: 'Select a person...', zh: '选择一位成员…' },
  'admin.why_person': { en: 'Why this person?', zh: '为什么推荐他/她？' },
  'admin.brief_reason': { en: 'Brief reason...', zh: '简要理由…' },
  'admin.send_suggestion': { en: 'Send suggestion', zh: '发送推荐' },
  'admin.suggestion_sent': { en: 'Suggestion sent to the listing owner.', zh: '推荐已发送给发布者。' },
  'admin.pick_both': { en: 'Pick both a listing and a classmate.', zh: '请同时选择信息和成员。' },
  'admin.invite_desc': {
    en: 'Invite a new member to the Republic. They’ll receive an email with instructions to set up their profile.',
    zh: '邀请新成员加入共和国。他们会收到一封包含建档说明的邮件。',
  },
  'admin.invite_email_placeholder': { en: 'classmate@school.edu', zh: 'classmate@school.edu' },
  'admin.role_context': { en: 'Role / context', zh: '角色 / 背景' },
  'admin.role_placeholder': { en: 'e.g. Class 27, CEO of...', zh: '例如：Class 27，某公司 CEO…' },
  'admin.send_invitation': { en: 'Send invitation', zh: '发送邀请' },
  'admin.invitation_sent': { en: 'Invitation sent to', zh: '邀请已发送至' },
  'admin.invitation_failed': { en: 'Invitation failed.', zh: '邀请发送失败。' },

  // Shared
  'common.sending': { en: 'Sending...', zh: '发送中…' },
};

export function ui(key: string, lang: Language = 'en'): string {
  const entry = UI_STRINGS[key];
  if (!entry) return key;
  return entry[lang] ?? entry.en ?? key;
}
