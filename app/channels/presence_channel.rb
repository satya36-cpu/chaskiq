class PresenceChannel < ApplicationCable::Channel
  def subscribed
    @app      = App.find_by(key: params[:app])

    get_user_data

    @app_user = @app.app_users
                    .where("email =?", @user_data[:email])
                    .first
    #@app.users.find_by(email: params[:email]).try(:app_user) 
    #add_user(email: params[:email], properties: params[:properties])
    @key      = "presence:#{@app.key}-#{@app_user.email}"
    stream_from @key
    pingback
  end

  def pingback
    @app_user.online! if @app_user.offline?
  end

  def unsubscribed
    @app_user.offline! if @app_user.online?
    # Any cleanup needed when channel is unsubscribed
  end

end
