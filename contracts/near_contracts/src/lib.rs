use borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, Promise};

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct TaskListing {
    pub job_id: String,
    pub employer: AccountId,
    pub title: String,
    pub task_spec: String,
    pub task_digest: String,
    pub max_budget_yoctonear: U128,
    pub escrow_yoctonear: U128,
    pub created_at_ns: u64,
    pub status: String,
    pub selected_worker: Option<AccountId>,
    pub awarded_price_yoctonear: Option<U128>,
    pub result_digest: Option<String>,
    pub deliverable_uri: Option<String>,
    pub receipt_id: Option<String>,
    pub settlement_tx: Option<String>,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct EvidenceReceipt {
    pub receipt_id: String,
    pub job_id: String,
    pub employer: AccountId,
    pub worker: AccountId,
    pub task_digest: String,
    pub result_digest: String,
    pub price_yoctonear: U128,
    pub settlement_tx: String,
    pub block_height: u64,
    pub timestamp_ns: u64,
    pub outcome: String,
    pub sig: String,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct PublishedRootRecord {
    pub day_utc: String,
    pub root: String,
    pub leaf_count: u32,
    pub published_at_ns: u64,
    pub published_by: AccountId,
    pub block_height: u64,
}

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    Tasks,
    CommittedBids,
    RevealedBids,
    PublishedRoots,
}

#[near(contract_state)]
pub struct ClearingHouseContract {
    pub owner_id: AccountId,
    pub tasks: LookupMap<String, TaskListing>,
    pub task_ids: Vec<String>,
    pub committed_bids: LookupMap<String, String>, // "jobId:worker" -> bid_hash
    pub revealed_bids: LookupMap<String, U128>,   // "jobId:worker" -> price
    pub published_roots: LookupMap<String, PublishedRootRecord>,
    pub roots_list: Vec<String>,
}

impl Default for ClearingHouseContract {
    fn default() -> Self {
        Self {
            owner_id: "clearing.testnet".parse().unwrap(),
            tasks: LookupMap::new(StorageKey::Tasks),
            task_ids: Vec::new(),
            committed_bids: LookupMap::new(StorageKey::CommittedBids),
            revealed_bids: LookupMap::new(StorageKey::RevealedBids),
            published_roots: LookupMap::new(StorageKey::PublishedRoots),
            roots_list: Vec::new(),
        }
    }
}

#[near]
impl ClearingHouseContract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            tasks: LookupMap::new(StorageKey::Tasks),
            task_ids: Vec::new(),
            committed_bids: LookupMap::new(StorageKey::CommittedBids),
            revealed_bids: LookupMap::new(StorageKey::RevealedBids),
            published_roots: LookupMap::new(StorageKey::PublishedRoots),
            roots_list: Vec::new(),
        }
    }

    #[payable]
    pub fn post_task(
        &mut self,
        job_id: String,
        title: String,
        task_spec: String,
        task_digest: String,
        max_budget_yoctonear: U128,
    ) -> TaskListing {
        require!(!self.tasks.contains_key(&job_id), "Job already exists");
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            deposit >= max_budget_yoctonear.0,
            "Attached deposit must cover max budget"
        );

        let employer = env::predecessor_account_id();
        let task = TaskListing {
            job_id: job_id.clone(),
            employer,
            title,
            task_spec,
            task_digest,
            max_budget_yoctonear,
            escrow_yoctonear: U128(deposit),
            created_at_ns: env::block_timestamp(),
            status: "OPEN".to_string(),
            selected_worker: None,
            awarded_price_yoctonear: None,
            result_digest: None,
            deliverable_uri: None,
            receipt_id: None,
            settlement_tx: None,
        };

        self.tasks.insert(&job_id, &task);
        self.task_ids.push(job_id);
        task
    }

    pub fn commit_bid(&mut self, job_id: String, bid_hash: String) {
        let task = self.tasks.get(&job_id).expect("Job not found");
        require!(task.status == "OPEN", "Job is not open");
        let worker = env::predecessor_account_id();
        let key = format!("{}:{}", job_id, worker);
        self.committed_bids.insert(&key, &bid_hash);
    }

    pub fn reveal_bid(&mut self, job_id: String, price_yoctonear: U128, salt: String) {
        let worker = env::predecessor_account_id();
        let key = format!("{}:{}", job_id, worker);
        let committed = self.committed_bids.get(&key).expect("No committed bid");

        let preimage = format!("{}:{}:{}", worker, price_yoctonear.0, salt);
        let hash = env::sha256(preimage.as_bytes());
        let hash_hex = hex::encode(hash);
        require!(committed == hash_hex, "Commitment hash mismatch");

        self.revealed_bids.insert(&key, &price_yoctonear);
    }

    pub fn award_job(&mut self, job_id: String, worker: AccountId) -> TaskListing {
        let mut task = self.tasks.get(&job_id).expect("Job not found");
        require!(
            task.employer == env::predecessor_account_id(),
            "Only employer can award"
        );
        require!(task.status == "OPEN", "Job not open");

        let key = format!("{}:{}", job_id, worker);
        let price = self.revealed_bids.get(&key).expect("Worker has not revealed bid");

        task.selected_worker = Some(worker);
        task.awarded_price_yoctonear = Some(price);
        task.status = "AWARDED".to_string();

        self.tasks.insert(&job_id, &task);
        task
    }

    pub fn deliver_work(
        &mut self,
        job_id: String,
        result_digest: String,
        deliverable_uri: String,
    ) -> TaskListing {
        let mut task = self.tasks.get(&job_id).expect("Job not found");
        let worker = env::predecessor_account_id();
        require!(
            task.selected_worker.as_ref() == Some(&worker),
            "Caller is not awarded worker"
        );
        require!(task.status == "AWARDED", "Job not in awarded status");

        task.result_digest = Some(result_digest);
        task.deliverable_uri = Some(deliverable_uri);
        task.status = "DELIVERED".to_string();

        self.tasks.insert(&job_id, &task);
        task
    }

    pub fn accept_and_settle(
        &mut self,
        job_id: String,
        signature: String,
        settlement_tx: Option<String>,
    ) -> EvidenceReceipt {
        let mut task = self.tasks.get(&job_id).expect("Job not found");
        let employer = env::predecessor_account_id();
        require!(task.employer == employer, "Only employer can settle");
        require!(task.status == "DELIVERED", "Deliverable not ready");

        let worker = task.selected_worker.clone().unwrap();
        let payout = task.awarded_price_yoctonear.unwrap();
        let tx_hash = settlement_tx.unwrap_or_else(|| {
            let tx_pre = format!("tx_settle_{}_{}", job_id, env::block_height());
            hex::encode(env::sha256(tx_pre.as_bytes()))
        });
        let receipt_id = format!("rcpt_{}", &tx_hash[0..16]);

        task.status = "CLEARED".to_string();
        task.receipt_id = Some(receipt_id.clone());
        task.settlement_tx = Some(tx_hash.clone());
        self.tasks.insert(&job_id, &task);

        // Release escrow payout to worker
        Promise::new(worker.clone()).transfer(NearToken::from_yoctonear(payout.0));

        EvidenceReceipt {
            receipt_id,
            job_id,
            employer,
            worker,
            task_digest: task.task_digest,
            result_digest: task.result_digest.unwrap(),
            price_yoctonear: payout,
            settlement_tx: tx_hash,
            block_height: env::block_height(),
            timestamp_ns: env::block_timestamp(),
            outcome: "CLEARED".to_string(),
            sig: signature,
        }
    }

    pub fn publish_root(&mut self, day_utc: String, root: String, leaf_count: u32) -> PublishedRootRecord {
        let record = PublishedRootRecord {
            day_utc: day_utc.clone(),
            root,
            leaf_count,
            published_at_ns: env::block_timestamp(),
            published_by: env::predecessor_account_id(),
            block_height: env::block_height(),
        };

        self.published_roots.insert(&day_utc, &record);
        self.roots_list.push(day_utc);
        record
    }

    pub fn get_task(&self, job_id: String) -> Option<TaskListing> {
        self.tasks.get(&job_id)
    }

    pub fn get_root(&self, day_utc: String) -> Option<PublishedRootRecord> {
        self.published_roots.get(&day_utc)
    }

    pub fn get_latest_root(&self) -> Option<PublishedRootRecord> {
        self.roots_list.last().and_then(|day| self.published_roots.get(day))
    }
}
