import cron from 'node-cron'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

console.log('🚀 AIGENCY Cron Worker Started')

// Run every 3 minutes
cron.schedule('*/3 * * * *', async () => {
  console.log('⏰ Running 3-minute increment job...')
  
  try {
    // Get all users with auto-scraper enabled
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, subscription_tier, today_applications_count, last_application_date, application_count')
      .eq('auto_scraper_enabled', true)
    
    if (error) {
      console.error('Error fetching users:', error)
      return
    }
    
    if (!users || users.length === 0) {
      console.log('No active users with auto-scraper enabled')
      return
    }
    
    console.log(`Found ${users.length} active users`)
    
    const today = new Date().toISOString().split('T')[0]
    
    for (const user of users) {
      const dailyLimit = user.subscription_tier === 'premium' ? 50 : user.subscription_tier === 'pro' ? 25 : 5
      
      // Check if it's a new day
      const lastDate = user.last_application_date ? new Date(user.last_application_date).toISOString().split('T')[0] : null
      const isNewDay = lastDate !== today
      
      // Reset count if new day
      const currentTodayCount = isNewDay ? 0 : (user.today_applications_count || 0)
      
      // Check if already hit limit
      if (currentTodayCount >= dailyLimit) {
        console.log(`User ${user.email} hit daily limit (${currentTodayCount}/${dailyLimit})`)
        
        // Disable auto-scraper
        await supabase
          .from('profiles')
          .update({ auto_scraper_enabled: false })
          .eq('id', user.id)
        
        console.log(`Disabled auto-scraper for ${user.email}`)
        continue
      }
      
      // Increment counters
      const newTodayCount = currentTodayCount + 1
      const newTotalCount = user.application_count + 1
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          today_applications_count: newTodayCount,
          application_count: newTotalCount,
          last_application_date: new Date().toISOString()
        })
        .eq('id', user.id)
      
      if (updateError) {
        console.error(`Error updating user ${user.email}:`, updateError)
      } else {
        console.log(`✅ ${user.email}: ${newTodayCount}/${dailyLimit} today, ${newTotalCount} total`)
      }
    }
    
    console.log('✅ Increment job completed')
  } catch (error) {
    console.error('Cron job error:', error)
  }
})

// Keep process alive
setInterval(() => {}, 1000)
