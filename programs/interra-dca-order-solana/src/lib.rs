// Solana DCA Order Contract (Anchor version)
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer as TokenTransfer};

use std::str::FromStr;

// Program ID
declare_id!("GXjKcJ6RHuBuKMRe8SDtqosckaiVcGradnv9yYByR8TG");

#[program]
pub mod interra_dca_order_solana {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, platform_fee: u16, treasury: Pubkey) -> Result<()> {
        require!(platform_fee < 10000, CustomError::InvalidPlatformFee);

        let config = &mut ctx.accounts.global_config;
        config.owner = ctx.accounts.signer.key();
        config.platform_fee = platform_fee;
        config.treasury = treasury;
        config.paused = false;
        config.reserved = [0; 128]; // Initialize reserved space to zero
        emit!(Initialized {
            owner: config.owner,
            platform_fee: config.platform_fee,
            treasury: config.treasury,
            paused: config.paused,
        });
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_owner: Pubkey,
        new_platform_fee: u16,
        new_treasury: Pubkey,
        new_paused: bool,
    ) -> Result<()> {
        require!(new_platform_fee < 10000, CustomError::InvalidPlatformFee);

        let config = &mut ctx.accounts.global_config;

        config.owner = new_owner;
        config.platform_fee = new_platform_fee;
        config.treasury = new_treasury;
        config.paused = new_paused;

        emit!(ConfigUpdated {
            owner: config.owner,
            platform_fee: config.platform_fee,
            treasury: config.treasury,
            paused: config.paused,
        });

        Ok(())
    }

    pub fn open_order_sol(ctx: Context<OpenOrderSol>, params: OpenOrderParams) -> Result<()> {
        if params.from_token != native_token()
            || params.from_chain_id != 10002
            || params.amount_in == 0
            || params.to_chain_id == 0
            || params.to_token == [0u8; 32]
            || params.recipient == [0u8; 32]
            || params.execute_count == 0
            || params.time_interval == 0
            || params.amount_out_min == [0u8; 32]
            || params.amount_out_max == [0u8; 32]
        {
            return Err(error!(CustomError::InvalidParameter));
        }
        require!(
            !ctx.accounts.global_config.paused,
            CustomError::ProgramPaused
        );

        require!(
            ctx.accounts.user.lamports() > params.amount_in,
            CustomError::InsufficientFunds
        );

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.order.to_account_info(),
                },
            ),
            params.amount_in, // lamports
        )?;

        let order = &mut ctx.accounts.order;

        add_order(order, &ctx.accounts.user, &params, ctx.bumps.order);

        emit!(OrderOpened {
            order_pubkey: ctx.accounts.order.key(),
        });

        Ok(())
    }

    pub fn open_order_spl(ctx: Context<OpenOrderSpl>, params: OpenOrderParams) -> Result<()> {
        if params.from_token == native_token()
            || params.from_chain_id != 10002
            || params.amount_in == 0
            || params.to_chain_id == 0
            || params.to_token == [0u8; 32]
            || params.recipient == [0u8; 32]
            || params.execute_count == 0
            || params.time_interval == 0
            || params.amount_out_min == [0u8; 32]
            || params.amount_out_max == [0u8; 32]
        {
            return Err(error!(CustomError::InvalidParameter));
        }
        let clock = Clock::get()?;
        if params.time_stamp <= clock.unix_timestamp {
            return Err(error!(CustomError::InvalidParameter));
        }
        require_keys_eq!(
            ctx.accounts.token_mint.key(),
            params.from_token,
            CustomError::InvalidParameter
        );
        require_keys_eq!(
            ctx.accounts.user_token_account.mint,
            params.from_token,
            CustomError::InvalidParameter
        );

        // Transfer SPL token to order_token_account
        let cpi_accounts = TokenTransfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.order_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

        // Transfer SPL tokens
        token::transfer(cpi_ctx, params.amount_in)?;

        let order = &mut ctx.accounts.order;
        add_order(order, &ctx.accounts.user, &params, ctx.bumps.order);

        emit!(OrderOpened {
            order_pubkey: ctx.accounts.order.key(),
        });
        Ok(())
    }
}

fn native_token() -> Pubkey {
    Pubkey::from_str("So11111111111111111111111111111111111111112").unwrap()
}

fn add_order(order: &mut Account<DCAOrder>, user: &Signer, params: &OpenOrderParams, bump: u8) {
    order.from_token = params.from_token;
    order.from_chain_id = params.from_chain_id;
    order.amount_in = params.amount_in;
    order.amount_out_min = params.amount_out_min;
    order.amount_out_max = params.amount_out_max;
    order.to_chain_id = params.to_chain_id;
    order.to_token = params.to_token;
    order.sender = user.key();
    order.recipient = params.recipient;
    order.execute_count = params.execute_count;
    order.remaining_execute_count = params.execute_count;
    order.time_interval = params.time_interval;
    order.remaining_amount = params.amount_in;
    order.time_stamp = params.time_stamp;
    order.bump = bump;
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        seeds = [b"global-config"],
        bump,
        payer = signer,
        space = 8 + GlobalConfig::SIZE
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"global-config"],
        bump,
        has_one = owner
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(params: OpenOrderParams)]
pub struct OpenOrderSol<'info> {
    #[account(
        init,
        seeds = [b"dca_order", user.key().as_ref(),&params.time_stamp.to_le_bytes()],
        bump,
        payer = user,
        space = 8 + DCAOrder::SIZE,
    )]
    pub order: Account<'info, DCAOrder>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: OpenOrderParams)]
pub struct OpenOrderSpl<'info> {
    #[account(
        init,
        seeds = [b"dca_order", user.key().as_ref(),&params.time_stamp.to_le_bytes()],
        bump,
        payer = user,
        space = 8 + DCAOrder::SIZE,
    )]
    pub order: Account<'info, DCAOrder>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = user,
        associated_token::mint = token_mint,
        associated_token::authority = order
    )]
    pub order_token_account: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,

    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
}

#[account]
pub struct GlobalConfig {
    pub owner: Pubkey,
    pub platform_fee: u16,
    pub treasury: Pubkey,
    pub paused: bool,
    pub reserved: [u8; 128], // Reserved space for future use
}

impl GlobalConfig {
    pub const SIZE: usize = 32 + 2 + 32 + 1 + 128;
}

#[account]
pub struct DCAOrder {
    pub from_token: Pubkey,
    pub from_chain_id: u64,
    pub amount_in: u64,
    pub amount_out_min: [u8; 32],
    pub amount_out_max: [u8; 32],
    pub to_chain_id: u64,
    pub to_token: [u8; 32],
    pub sender: Pubkey,
    pub recipient: [u8; 32],
    pub execute_count: u16,
    pub remaining_execute_count: u16,
    pub time_interval: u64,
    pub remaining_amount: u64,
    pub time_stamp: i64,
    pub bump: u8,
}

impl DCAOrder {
    pub const SIZE: usize = 8  // discriminator
        + 32  // from_token
        + 8   // from_chain_id
        + 8   // amount_in
        + 32  // amount_out_min
        + 32  // amount_out_max
        + 8   // to_chain_id
        + 32  // to_token
        + 32  // sender
        + 32  // recipient
        + 2   // execute_count
        + 2   // remaining_execute_count
        + 8   // time_interval
        + 8   // remaining_amount
        + 8  //time_stamp
        + 1; // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OpenOrderParams {
    pub from_token: Pubkey,
    pub from_chain_id: u64,
    pub amount_in: u64,
    pub amount_out_min: [u8; 32],
    pub amount_out_max: [u8; 32],
    pub to_chain_id: u64,
    pub to_token: [u8; 32],
    pub recipient: [u8; 32],
    pub execute_count: u16,
    pub time_interval: u64,
    pub time_stamp: i64,
}

#[event]
pub struct Initialized {
    pub owner: Pubkey,
    pub platform_fee: u16,
    pub treasury: Pubkey,
    pub paused: bool,
}

#[event]
pub struct ConfigUpdated {
    pub owner: Pubkey,
    pub platform_fee: u16,
    pub treasury: Pubkey,
    pub paused: bool,
}

#[event]
pub struct OrderOpened {
    pub order_pubkey: Pubkey,
}

#[event]
pub struct OrderCancelled {
    pub order_pubkey: Pubkey,
    pub by: Pubkey,
}
#[event]
pub struct OrderExecuted {
    pub order_pubkey: Pubkey,
    pub by: Pubkey,
    pub native_token_volume: u64,
}

#[error_code]
pub enum CustomError {
    #[msg("The program is currently paused.")]
    ProgramPaused,
    #[msg("Platform fee must be between 0 and 10000.")]
    InvalidPlatformFee,
    #[msg("Invalid parameter")]
    InvalidParameter,
    #[msg("Expiry time must be in the future.")]
    ExpiryEarlier,
    #[msg("math over flow.")]
    Overflow,
    #[msg("Insufficient funds for the operation.")]
    InsufficientFunds,
    #[msg("OnlySenderOrOwner.")]
    OnlySenderOrOwner,
    #[msg("Invalid refund receiver.")]
    InvalidRefundReceiver,
    #[msg("Only owner can execute.")]
    OnlyOwnerCanExecute,
}
