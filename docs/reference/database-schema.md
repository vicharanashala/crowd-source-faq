# Database Schema Reference - Yaksha FAQ Portal

**Database**: `yaksha_faq` on MongoDB cluster0.z3cgb58

---

## Collections & Indexes

### users (yaksha_faq_users)
| Field | Type | Notes |
|---|---|---|
| name | String | |
| email | String | unique |
| password | String | bcrypt hashed |
| role | Enum | `admin`, `moderator`, `expert`, `user` |
| reputation | Number | points |
| suspended | Boolean | |
| emailVerified | Boolean | |
| **Indexes**: email (unique) |

### faqs (yaksha_faq_faqs)
| Field | Type | Notes |
|---|---|---|
| question | String | required |
| answer | String | required |
| category | String | required |
| embedding | Number[] | vector for semantic search |
| searchCount | Number | default 0 |
| status | Enum | `pending`, `approved`, `rejected` |
| views | Number | |
| helpfulVotes | Number | |
| unhelpfulVotes | Number | |
| createdBy | ObjectId (User) | |
| reports | Array | {reportedBy, reason, createdAt} |
| suggestions | Array | {suggestedBy, suggestion, createdAt} |
| freshnessTier | Enum | `evergreen`, `seasonal`, `volatile` |
| reviewIntervalDays | Number | |
| reviewStatus | Enum | `verified`, `pending_review`, `update_requested` |
| lastVerifiedDate | Date | |
| flaggedAt | Date | null |
| flagType | Enum | `auto`, `manual`, null |
| flagReason | String | null |
| flaggedBy | ObjectId (User) | null |
| reviewCycle | Number | |
| trustLevel | Enum | `low`, `medium`, `high`, `expert` |
| sourceType | Enum | `manual`, `community_promotion`, `expert_verified` |
| sourceCommunityPostId | ObjectId | null |
| sourceCommentId | ObjectId | null |
| promotedAt | Date | null |
| objectionStatus | Enum | `none`, `objected`, `resolved` |
| promotionMetadata | Object | {upvotesAtPromotion, helpfulVotesAtPromotion, communityAnswerAuthorId, promotedBy, objectionReason, objectionRaisedBy, objectionRaisedAt} |
| **Indexes**: text (question, answer), trustLevel+objectionStatus+promotedAt, sourceType+sourceCommunityPostId |

### communityposts (yaksha_faq_communityposts)
| Field | Type | Notes |
|---|---|---|
| title | String | required |
| body | String | required |
| tags | String[] | |
| author | ObjectId (User) | |
| status | Enum | `answered`, `unanswered` |
| answer | String | null |
| answerIsExpert | Boolean | |
| dna | Object | {steps, tools, timeToComplete, difficulty} |
| upvotes | ObjectId[] (User) | |
| comments | Subdocument[] | nested comment tree |
| reports | Array | {reportedBy, reason, createdAt} |
| embedding | Number[] | |
| escalationStatus | Enum | `none`, `escalated`, `resolved`, `dismissed` |
| escalatedAt | Date | null |
| escalationReason | String | null |
| escalatedBy | ObjectId (User) | null |
| escalationResolvedAt | Date | null |
| escalationResolvedBy | ObjectId (User) | null |
| escalationOutcome | String | null |
| answeredFromKnowledgeId | ObjectId | |
| timeTrialStatus | Enum | `none`, `pending`, `awarded` |
| timeTrialStartedAt | Date | null |
| timeTrialFirstResponder | ObjectId (User) | null |
| timeTrialFirstResponderAt | Date | null |
| eligibleForPromotion | Boolean | |
| promotionPendingAt | Date | null |
| promotionCandidateCommentId | ObjectId | null |
| promotionObjectedBy | ObjectId | null |
| promotionObjectedAt | Date | null |
| promotionObjectionReason | String | null |
| **Indexes**: text (title, body), status+timeTrialStatus+createdAt, upvotes (unique), eligibleForPromotion+promotionPendingAt, status+eligibleForPromotion, escalationStatus+createdAt, escalationStatus+escalatedAt |

### comments (embedded in communityposts)
| Field | Type | Notes |
|---|---|---|
| author | ObjectId (User) | |
| body | String | max 1000 |
| upvotes | ObjectId[] (User) | |
| downvotes | ObjectId[] (User) | |
| verified | Boolean | |
| isExpertAnswer | Boolean | |
| isFirstResponder | Boolean | |
| firstResponderAwardedAt | Date | |
| parentId | ObjectId | null for top-level |
| depth | Number | max 3 |
| replies | Subdocument[] | nested replies |
| solutionDNA | Object | {keyPoints, summary, tags} |

### fresh_review_logs (yaksha_faq_fresh_review_logs)
| Field | Type | Notes |
|---|---|---|
| faqId | ObjectId | |
| event | String | `auto_flag`, `auto_verify`, `escalated`, `inactivity`, `freshness_vote` |
| createdAt | Date | |
| metadata | Object | |
| **Indexes**: faqId+createdAt, event+createdAt |

### fresh_review_votes (yaksha_faq_fresh_review_votes)
| Field | Type | Notes |
|---|---|---|
| faqId | ObjectId | |
| reviewCycle | Number | |
| voterId | ObjectId (User) | |
| verdict | Enum | `still_accurate`, `needs_update` |
| suggestion | String | optional, max 300 |
| **Indexes**: faqId+reviewCycle+voterId (unique), faqId+reviewCycle+verdict |

### tea_notifications (yaksha_faq_tea_notifications)
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId (User) | recipient |
| eventType | String | `post_answered`, `post_deleted`, `first_responder_awarded`, `post_answered_user` |
| postId | ObjectId | |
| postTitle | String | |
| triggeredBy | ObjectId (User) | |
| triggeredByName | String | |
| content | String | answer snippet |
| read | Boolean | |
| **Indexes**: userId+read, userId+createdAt |

### notifications (yaksha_faq_notifications)
| Field | Type | Notes |
|---|---|---|
| recipient | ObjectId (User) | |
| type | String | |
| title | String | |
| message | String | |
| link | String | |
| read | Boolean | |
| **Indexes**: recipient+read, recipient+createdAt |

### notification_settings (yaksha_faq_notification_settings)
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId (User) | unique |
| email | Boolean | |
| push | Boolean | |
| digest | Boolean | |
| types | Object | per-notification-type flags |

### unresolved_searches (yaksha_faq_unresolved_searches)
| Field | Type | Notes |
|---|---|---|
| query | String | |
| count | Number | |
| lastSearchedAt | Date | |
| status | Enum | `unresolved`, `resolved` |
| faqId | ObjectId | optional linked FAQ |
| **Indexes**: status+createdAt, faqId |

### transcript_knowledge (yaksha_faq_transcript_knowledge)
| Field | Type | Notes |
|---|---|---|
| zoomMeetingId | String | |
| question | String | |
| answer | String | |
| embedding | Number[] | |
| speaker | String | |
| startTime | Number | |
| endTime | Number | |
| createdAt | Date | |

### zoom_meetings (yaksha_faq_zoom_meetings)
| Field | Type | Notes |
|---|---|---|
| zoomMeetingId | String | unique |
| topic | String | |
| startTime | Date | |
| duration | Number | minutes |
| participants | String[] | |
| processed | Boolean | |

### search_logs (yaksha_faq_searchlogs)
| Field | Type | Notes |
|---|---|---|
| query | String | |
| results | Number | count returned |
| clickedFaqId | ObjectId | optional |
| createdAt | Date | |
| **Indexes**: query+createdAt, TTL 90-day on createdAt |

### admin_logs (yaksha_faq_admin_logs)
| Field | Type | Notes |
|---|---|---|
| adminId | ObjectId (User) | |
| action | String | e.g. `dismiss_escalated_post`, `resolve_escalated_post` |
| targetId | ObjectId | |
| targetType | String | e.g. `community_post` |
| details | String | |

### moderation_logs (yaksha_faq_moderation_logs)
| Field | Type | Notes |
|---|---|---|
| moderatorId | ObjectId (User) | |
| action | String | |
| targetId | ObjectId | |
| targetType | String | |
| reason | String | |

### reputation_logs (yaksha_faq_reputation_logs)
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId (User) | |
| delta | Number | +/- points |
| reason | String | |
| sourceId | ObjectId | |

### badges (yaksha_faq_badges)
| Field | Type | Notes |
|---|---|---|
| name | String | unique |
| description | String | |
| icon | String | |
| criteria | String | |

---

## Key Enums

### FAQStatus: `pending` | `approved` | `rejected`
### FreshnessTier: `evergreen` | `seasonal` | `volatile`
### ReviewStatus: `verified` | `pending_review` | `update_requested`
### TrustLevel: `low` | `medium` | `high` | `expert`
### SourceType: `manual` | `community_promotion` | `expert_verified`
### ObjectionStatus: `none` | `objected` | `resolved`
### CommunityPostStatus: `answered` | `unanswered`
### EscalationStatus: `none` | `escalated` | `resolved` | `dismissed`
### TimeTrialStatus: `none` | `pending` | `awarded`

---

## TTL & Cleanup Policies

- `search_logs`: 90-day TTL on `createdAt` (auto-deleted after 90 days)
- `fresh_review_logs`: No TTL (audit trail)
- All other collections: No automatic expiry